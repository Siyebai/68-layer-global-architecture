"""
任务3: 多智能体事件总线 — 融合仓库 communication/event-bus.js + multi-agent-system/
轻量Python版，支持发布/订阅、Agent注册、状态同步
"""
import threading, queue, time, json
from datetime import datetime
from collections import defaultdict

class EventBus:
    """
    对标仓库 event-bus.js (PORT 19958)
    Python轻量版，用于协调信号/风控/执行三层Agent
    """
    def __init__(self):
        self._subscribers = defaultdict(list)
        self._queue = queue.Queue()
        self._agents = {}   # agentId -> {status, lastSeen, capabilities}
        self._history = []  # 消息历史 (最近500条)
        self._running = False
        self._lock = threading.Lock()

    def register(self, agent_id, capabilities=None):
        with self._lock:
            self._agents[agent_id] = {
                "status": "online", "capabilities": capabilities or [],
                "lastSeen": datetime.now().isoformat(), "msgCount": 0
            }
        print(f"[EventBus] ✅ Agent注册: {agent_id} 能力={capabilities}")

    def publish(self, event, payload, source="system"):
        msg = {
            "id": f"msg-{int(time.time()*1000)}",
            "event": event, "payload": payload,
            "source": source, "ts": datetime.now().isoformat()
        }
        self._queue.put(msg)
        with self._lock:
            self._history.append(msg)
            if len(self._history) > 500: self._history.pop(0)
            if source in self._agents:
                self._agents[source]["msgCount"] += 1
                self._agents[source]["lastSeen"] = datetime.now().isoformat()

    def subscribe(self, event_pattern, handler, agent_id=None):
        with self._lock:
            self._subscribers[event_pattern].append({"handler": handler, "agent": agent_id})

    def _dispatch(self, msg):
        event = msg["event"]
        for pattern, handlers in self._subscribers.items():
            if pattern == event or pattern == "*" or event.startswith(pattern.rstrip("*")):
                for h in handlers:
                    try:
                        h["handler"](msg["payload"], msg)
                    except Exception as e:
                        print(f"[EventBus] ❌ handler错误 {h.get('agent')}: {e}")

    def start(self):
        self._running = True
        def loop():
            while self._running:
                try:
                    msg = self._queue.get(timeout=0.1)
                    self._dispatch(msg)
                except queue.Empty:
                    continue
        t = threading.Thread(target=loop, daemon=True)
        t.start()
        print("[EventBus] 🚀 事件总线已启动")
        return t

    def status(self):
        with self._lock:
            return {
                "agents": len(self._agents),
                "online": sum(1 for a in self._agents.values() if a["status"]=="online"),
                "queued": self._queue.qsize(),
                "history": len(self._history),
                "agent_list": {k: {**v} for k,v in self._agents.items()}
            }

    def stop(self):
        self._running = False


class SignalAgent:
    """信号层Agent — 扫描并发布信号事件"""
    def __init__(self, bus: EventBus):
        self.bus = bus
        self.id = "signal-agent"
        bus.register(self.id, ["signal_scan","grade_ABCD","multi_timeframe"])

    def emit_signal(self, sym, grade, direction, strength, price, atr):
        self.bus.publish("signal:new", {
            "symbol": sym, "grade": grade,
            "direction": direction, "strength": strength,
            "price": price, "atr": atr
        }, source=self.id)


class RiskAgent:
    """风控层Agent — 监听信号，计算仓位，发布决策"""
    def __init__(self, bus: EventBus, equity=250.0):
        self.bus = bus
        self.id = "risk-agent"
        self.equity = equity
        self.open_positions = 0
        self.daily_pnl = 0.0
        bus.register(self.id, ["position_sizing","kelly","drawdown_guard"])
        bus.subscribe("signal:new", self.on_signal, self.id)

    def on_signal(self, payload, msg):
        if payload["grade"] not in ["A","B"]: return
        if self.open_positions >= 2:
            self.bus.publish("decision:skip", {"reason":"已达最大持仓2","signal":payload}, source=self.id)
            return
        if self.daily_pnl <= -3.0:
            self.bus.publish("decision:skip", {"reason":"日亏上限触发","signal":payload}, source=self.id)
            return
        stop_dist = max(payload["atr"]*1.5, payload["price"]*0.0299)
        risk = self.equity * 0.004
        size = round(risk/stop_dist, 6)
        nominal = round(size*payload["price"], 2)
        sl = payload["price"]-stop_dist if payload["direction"]=="long" else payload["price"]+stop_dist
        tp = payload["price"]+stop_dist*1.2 if payload["direction"]=="long" else payload["price"]-stop_dist*1.2
        decision = {
            "symbol": payload["symbol"], "direction": payload["direction"],
            "entry": payload["price"], "size": size, "nominal": nominal,
            "stop_loss": round(sl,4), "take_profit": round(tp,4),
            "risk_usdt": round(risk,2), "grade": payload["grade"], "mode": "dryRun"
        }
        self.bus.publish("decision:execute", decision, source=self.id)
        print(f"  [RiskAgent] ✅ 风控通过 → {payload['symbol']} {payload['direction']} 名义${nominal}")


class ExecutionAgent:
    """执行层Agent — 监听决策，dryRun记录"""
    def __init__(self, bus: EventBus):
        self.bus = bus
        self.id = "execution-agent"
        self.sim_orders = []
        bus.register(self.id, ["dryRun_execution","order_logging"])
        bus.subscribe("decision:execute", self.on_decision, self.id)
        bus.subscribe("decision:skip", self.on_skip, self.id)

    def on_decision(self, payload, msg):
        order = {**payload, "orderId": f"SIM-{int(time.time()*1000)}", "ts": datetime.now().isoformat()}
        self.sim_orders.append(order)
        self.bus.publish("execution:filled", {"order": order, "status":"simulated"}, source=self.id)
        print(f"  [ExecAgent] 📋 dryRun订单 #{order['orderId'][-6:]} {order['symbol']} {order['direction']} @{order['entry']}")

    def on_skip(self, payload, msg):
        print(f"  [ExecAgent] ⏭️  跳过: {payload['reason']}")

    def get_orders(self):
        return self.sim_orders


class MonitorAgent:
    """监控Agent — 聚合所有事件，输出系统状态"""
    def __init__(self, bus: EventBus):
        self.bus = bus
        self.id = "monitor-agent"
        self.events = []
        bus.register(self.id, ["monitoring","alerting","reporting"])
        bus.subscribe("*", self.on_any, self.id)

    def on_any(self, payload, msg):
        self.events.append({"event": msg["event"], "source": msg["source"], "ts": msg["ts"]})


# ── 系统整合演示 ──
if __name__ == "__main__":
    print("="*65)
    print(f"🤝 多智能体事件总线系统  {datetime.now().strftime('%H:%M:%S')}")
    print("   融合仓库: event-bus.js + multi-agent-coordinator-v2.js")
    print("="*65)

    bus = EventBus()
    t = bus.start()

    signal_agent = SignalAgent(bus)
    risk_agent   = RiskAgent(bus, equity=250.0)
    exec_agent   = ExecutionAgent(bus)
    monitor      = MonitorAgent(bus)

    print(f"\n📡 Agent注册完成，开始事件流转...\n")
    time.sleep(0.1)

    # 模拟信号发布 (基于当前实时数据)
    import urllib.request
    def fetch(url):
        with urllib.request.urlopen(url, timeout=10) as r:
            return json.loads(r.read())

    test_signals = [
        ("SOLUSDT","A","short",0.85,79.32,2.1),
        ("XRPUSDT","A","short",0.75,1.32,0.03),
        ("BTCUSDT","B","short",0.60,66800,800),
        ("ETHUSDT","D","neutral",0.30,2050,55),  # 应被跳过
    ]

    for sym, grade, direction, strength, price, atr in test_signals:
        print(f"📤 发布信号: {sym} {grade}级 {direction}")
        signal_agent.emit_signal(sym, grade, direction, strength, price, atr)
        time.sleep(0.2)

    time.sleep(0.5)

    # 状态报告
    st = bus.status()
    print(f"\n📊 系统状态:")
    print(f"  在线Agent: {st['online']}/{st['agents']}")
    print(f"  消息总数:   {st['history']} 条")
    for aid, info in st['agent_list'].items():
        print(f"  {aid:20} 状态={info['status']} 发送={info['msgCount']}条 能力={info['capabilities']}")

    orders = exec_agent.get_orders()
    print(f"\n🎮 dryRun 订单: {len(orders)} 笔")
    for o in orders:
        print(f"  #{o['orderId'][-6:]} {o['symbol']:12} {o['direction']:6} @{o['entry']} SL={o['stop_loss']} TP={o['take_profit']}")

    print(f"\n✅ 多智能体系统运行正常")
    bus.stop()
