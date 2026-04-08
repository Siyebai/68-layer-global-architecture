"""
知识图谱 — 轻量Python版（无需Redis）
融合仓库 lib/brain/knowledge-graph.js 核心逻辑
用于存储交易知识、策略关系、信号结果
"""
import json, time, os
from datetime import datetime
from collections import defaultdict

class KnowledgeGraph:
    """
    内存版知识图谱，对标仓库 knowledge-graph.inmemory.js
    节点: 策略/信号/市场状态/交易结果
    边: 触发/导致/关联/优于
    """
    def __init__(self, persist_path=None):
        self.nodes = {}   # id -> {type, props, ts}
        self.edges = defaultdict(list)  # from -> [{to, rel, weight}]
        self.index = defaultdict(set)   # type -> {ids}
        self.persist_path = persist_path
        if persist_path and os.path.exists(persist_path):
            self.load()

    def add_node(self, nid, ntype, props=None):
        self.nodes[nid] = {'id':nid,'type':ntype,'props':props or {},'ts':time.time()}
        self.index[ntype].add(nid)
        return nid

    def add_edge(self, from_id, to_id, relation, weight=1.0, props=None):
        self.edges[from_id].append({
            'to':to_id,'rel':relation,'weight':weight,
            'props':props or {},'ts':time.time()
        })

    def get_by_type(self, ntype):
        return [self.nodes[nid] for nid in self.index.get(ntype,set()) if nid in self.nodes]

    def get_neighbors(self, nid, relation=None):
        edges = self.edges.get(nid,[])
        if relation: edges=[e for e in edges if e['rel']==relation]
        return [{'node':self.nodes.get(e['to']),'edge':e} for e in edges]

    def query(self, ntype=None, prop_filter=None):
        results = list(self.nodes.values())
        if ntype: results=[n for n in results if n['type']==ntype]
        if prop_filter:
            for k,v in prop_filter.items():
                results=[n for n in results if n['props'].get(k)==v]
        return results

    def save(self):
        if not self.persist_path: return
        data = {'nodes':self.nodes, 'edges':dict(self.edges), 'ts':datetime.now().isoformat()}
        with open(self.persist_path,'w') as f:
            json.dump(data, f, ensure_ascii=False, indent=2, default=str)

    def load(self):
        with open(self.persist_path,'r') as f:
            data = json.load(f)
        self.nodes = data.get('nodes',{})
        for k,v in data.get('edges',{}).items():
            self.edges[k] = v
        for nid, node in self.nodes.items():
            self.index[node['type']].add(nid)

    def stats(self):
        return {'nodes':len(self.nodes),'edges':sum(len(v) for v in self.edges.values()),
                'types':dict((k,len(v)) for k,v in self.index.items())}


class TradingKnowledgeBase:
    """
    交易知识库 — 第二大脑实现
    融合仓库 lib/brain/ 全部模块
    """
    def __init__(self):
        path = '/root/.openclaw/workspace/trading-system/data/knowledge_graph.json'
        os.makedirs(os.path.dirname(path), exist_ok=True)
        self.kg = KnowledgeGraph(persist_path=path)
        self._init_base_knowledge()

    def _init_base_knowledge(self):
        """初始化基础交易知识节点"""
        if self.kg.nodes: return  # 已有数据则跳过

        # 策略节点
        strategies = [
            ('strat_directional','strategy',{'name':'合约方向性','timeframe':'1h+4h','grade_system':'A/B/C/D'}),
            ('strat_funding','strategy',{'name':'资金费率套利','condition':'费率>0.1%/8h','hedge':'现货+合约'}),
            ('strat_swing','strategy',{'name':'波段交易','timeframe':'1d+4h','hold_days':'3-10'}),
            ('strat_hedge','strategy',{'name':'相关性对冲','pairs':'BTC/ETH,SOL/AVAX','spread_threshold':'2%'}),
            ('strat_arb','strategy',{'name':'价差套利','source':'现货vs合约','threshold':'0.15%'}),
        ]
        for nid, ntype, props in strategies:
            self.kg.add_node(nid, ntype, props)

        # 指标节点
        indicators = [
            ('ind_rsi','indicator',{'name':'RSI','oversold':41.36,'overbought':58.57,'period':14}),
            ('ind_macd','indicator',{'name':'MACD','fast':12,'slow':26,'signal':9}),
            ('ind_bb','indicator',{'name':'BollingerBands','period':20,'std':2}),
            ('ind_atr','indicator',{'name':'ATR','period':14,'use':'止损计算'}),
            ('ind_ema','indicator',{'name':'EMA','periods':[12,26,50,200]}),
        ]
        for nid, ntype, props in indicators:
            self.kg.add_node(nid, ntype, props)

        # 策略-指标关系
        self.kg.add_edge('strat_directional','ind_rsi','uses',0.9)
        self.kg.add_edge('strat_directional','ind_macd','uses',0.8)
        self.kg.add_edge('strat_directional','ind_bb','uses',0.7)
        self.kg.add_edge('strat_directional','ind_atr','uses',0.85)
        self.kg.add_edge('strat_swing','ind_rsi','uses',0.7)
        self.kg.add_edge('strat_swing','ind_ema','uses',0.8)

        # 风控节点
        self.kg.add_node('risk_core','risk_rule',{
            'name':'核心风控','max_positions':2,'daily_loss_limit':3,
            'stop_loss_pct':0.0299,'take_profit_r':1.2056,'risk_per_trade':0.004
        })
        self.kg.add_edge('strat_directional','risk_core','governed_by',1.0)

        self.kg.save()
        print(f"[KB] 初始化完成: {self.kg.stats()}")

    def record_signal(self, sym, grade, direction, price, result=None):
        """记录信号及结果"""
        nid = f"sig_{sym}_{int(time.time())}"
        self.kg.add_node(nid, 'signal', {
            'symbol':sym,'grade':grade,'direction':direction,
            'price':price,'result':result,'ts':datetime.now().isoformat()
        })
        self.kg.add_edge('strat_directional', nid, 'generated')
        if result == 'win':
            self.kg.add_edge(nid, 'strat_directional', 'strengthens', 0.1)
        elif result == 'loss':
            self.kg.add_edge(nid, 'strat_directional', 'weakens', 0.1)
        self.kg.save()
        return nid

    def get_strategy_performance(self):
        """查询各策略信号统计"""
        signals = self.kg.get_by_type('signal')
        by_grade = defaultdict(int)
        results = {'win':0,'loss':0,'pending':0}
        for s in signals:
            p = s['props']
            by_grade[p.get('grade','?')] += 1
            r = p.get('result','pending')
            results[r if r in results else 'pending'] += 1
        return {'total':len(signals),'by_grade':dict(by_grade),'results':results}

    def answer(self, question):
        """简单问答 — 对标仓库 qa-system.js"""
        q = question.lower()
        if '策略' in q or 'strategy' in q:
            strats = self.kg.get_by_type('strategy')
            return [s['props']['name'] for s in strats]
        if 'rsi' in q:
            n = self.kg.nodes.get('ind_rsi')
            return n['props'] if n else None
        if '风控' in q or 'risk' in q:
            n = self.kg.nodes.get('risk_core')
            return n['props'] if n else None
        if '信号' in q:
            return self.get_strategy_performance()
        return f"知识库共 {self.kg.stats()['nodes']} 个节点，{self.kg.stats()['edges']} 条关系"


if __name__ == "__main__":
    print("🧠 第二大脑知识库启动")
    kb = TradingKnowledgeBase()
    print(f"知识图谱统计: {kb.kg.stats()}")
    print(f"\n策略列表: {kb.answer('有哪些策略')}")
    print(f"RSI参数: {kb.answer('RSI设置')}")
    print(f"风控规则: {kb.answer('风控')}")

    # 模拟记录信号
    kb.record_signal('SOL','A','short',79.38)
    kb.record_signal('BTC','B','short',66800)
    print(f"\n信号统计: {kb.get_strategy_performance()}")
    print("\n✅ 第二大脑初始化完成")
