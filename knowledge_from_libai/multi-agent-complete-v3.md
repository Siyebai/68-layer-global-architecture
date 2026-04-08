# 多智能体协作 V3 - 完整设计方案

**优先级**: C李白 优先阅读
**版本**: 3.0 (完整版)
**日期**: 2026-03-28
**状态**: 最终架构决策

---

## 0. 设计原则

1. **结果导向**: 性能达标 > 延迟 <200ms, 吞吐 >15000/s
2. **绝对精简**: 避免过度设计，简单有效优先
3. **诚实严谨**: 所有性能指标真实测量，不夸大
4. **效率至上**: 资源利用率 >80%，无浪费
5. **边界严守**: 权限隔离，多租户数据安全
6. **静默工作流**: 自动化运行，人工干预最少

---

## 1. 整体架构

### 1.1 层次结构 (四层)

```
┌─────────────────────────────────────────────┐
│           业务层 (Business Layer)           │
│  User Service | Notification | Analytics    │
├─────────────────────────────────────────────┤
│          智能层 (Intelligence Layer)        │
│  Signal | Risk | Optimizer | Knowledge     │
├─────────────────────────────────────────────┤
│          执行层 (Execution Layer)           │
│  Trader | DataProcessor | Monitor          │
├─────────────────────────────────────────────┤
│        基础设施层 (Infrastructure Layer)    │
│  DB | Cache | Queue | Scheduler            │
└─────────────────────────────────────────────┘
```

### 1.2 Agent 数量分配 (总计 224)

| 类别 | 数量 | 占比 | 说明 |
|------|------|------|------|
| Trader (交易) | 40 | 17.9% | 执行交易信号 |
| RiskManager (风控) | 20 | 8.9% | 风险评估与控制 |
| DataProcessor (数据) | 30 | 13.4% | 数据处理与分析 |
| Monitor (监控) | 20 | 8.9% | 系统监控与告警 |
| UserService (用户) | 15 | 6.7% | 用户相关服务 |
| Optimizer (优化) | 10 | 4.5% | 系统自优化 |
| Knowledge (知识) | 20 | 8.9% | 知识管理与学习 |
| Notifier (通知) | 15 | 6.7% | 通知与报告 |
| Auditor (审计) | 10 | 4.5% | 审计与合规 |
| Infrastructure (基础) | 44 | 19.6% | 基础设施支持 |
| **总计** | **224** | **100%** | |

---

## 2. 详细设计

### 2.1 通信协议

**协议**: JSON over Redis Streams

**消息类型**:

```typescript
enum MessageType {
  EVENT = 'event',       // 事件通知
  COMMAND = 'command',   // 指令
  QUERY = 'query',       // 查询
  RESPONSE = 'response'  // 响应
}

interface Message {
  id: string;           // UUID
  type: MessageType;
  timestamp: number;    // Unix timestamp (ms)
  sender: string;       // Agent ID
  recipient: string;    // Agent ID 或 'broadcast'
  traceId?: string;     // 分布式追踪
  correlationId?: string; // 关联消息ID
  payload: {
    action: string;     // 动作名称
    data: any;          // 数据
    metadata?: any;     // 元数据
  };
}
```

**流 (Streams) 设计**:

| Stream 名称 | 生产者 | 消费者 | TTL | 描述 |
|-------------|--------|--------|-----|------|
| `events:market` | MarketDataAgent | SignalAgent, DataProcessor | 1h | 市场数据事件 |
| `events:trade` | TraderAgent | Monitor, Auditor | 24h | 交易事件 |
| `events:user` | UserAgent | Notifier, Analytics | 24h | 用户事件 |
| `commands:signal` | SignalAgent | TraderAgent | 1h | 交易信号 |
| `commands:risk` | SignalAgent | RiskManager | 1h | 风险评估请求 |
| `queries:price` | TraderAgent | DataProcessor | 5m | 价格查询 |
| `responses:*` | 各 Agent | 请求者 | 1h | 响应消息 |

### 2.2 Agent 基类设计

```javascript
// 所有 Agent 继承自 BaseAgent
class BaseAgent {
  constructor(config) {
    this.id = config.id;
    this.type = config.type;
    this.name = config.name;
    this.redis = config.redis; // 共享 Redis 连接
    this.logger = config.logger;
    this.metrics = config.metrics;
    this.state = new Map(); // 运行时状态
  }

  async start() {
    await this.connect();
    await this.subscribe();
    await this.run();
  }

  async stop() {
    await this.unsubscribe();
    await this.disconnect();
  }

  // 子类实现
  async onMessage(message) {}
  async onTick() {} // 定时任务
  async onError(error) {}

  // 辅助方法
  async publish(stream, payload) {
    const msg = this.wrapMessage(payload);
    await this.redis.xadd(stream, '*', 'data', JSON.stringify(msg));
    this.metrics.increment('messages.published');
  }

  async subscribe(streams, callback) {
    // 阻塞读取流
    while (true) {
      const resp = await this.redis.xread({ key: streams, count: 10, block: 1000 });
      if (resp) this.handleMessages(resp);
    }
  }

  wrapMessage(payload) {
    return {
      id: uuid(),
      type: payload.type || 'event',
      timestamp: Date.now(),
      sender: this.id,
      payload,
    };
  }
}
```

### 2.3 核心 Agent 详细设计

#### 2.3.1 MarketDataAgent (数据采集)

**数量**: 6个 (每交易所1个 + 2个备用)

**职责**:
- 连接交易所 WebSocket
- 订阅: 价格、深度、K线、交易
- 数据清洗 (去除异常值、重复)
- 发布到 `events:market`

**配置**:
```yaml
exchange: binance
symbols: [BTC/USDT, ETH/USDT, SOL/USDT, ...]
update_interval_ms: 100
heartbeat_interval_s: 30
```

**伪代码**:
```javascript
class MarketDataAgent extends BaseAgent {
  async onStart() {
    this.ws = new WebSocket(this.config.exchange.ws_url);
    this.ws.on('message', this.onRawData.bind(this));
  }

  onRawData(raw) {
    const data = this.normalize(raw); // 统一格式
    const validated = this.validate(data); // 验证
    this.publish('events:market', {
      type: 'market_update',
      data: validated
    });
  }

  normalize(raw) {
    // 各交易所数据格式不同，统一为内部格式
    return {
      exchange: this.config.exchange.name,
      symbol: raw.s,
      bid: parseFloat(raw.b),
      ask: parseFloat(raw.a),
      bidQty: parseFloat(raw.B),
      askQty: parseFloat(raw.A),
      timestamp: Date.now()
    };
  }
}
```

#### 2.3.2 SignalAgent (信号生成)

**数量**: 10个 (并行处理不同策略)

**职责**:
- 订阅 `events:market`
- 运行套利算法
- 输出交易信号到 `commands:signal`
- 请求风险评估到 `commands:risk`

**套利策略** (4种):

1. **跨交易所套利** (2 Agent)
   - 监控同一交易对不同交易所价差
   - 阈值: >0.5% 触发
   - 速度要求: <100ms

2. **三角套利** (3 Agent)
   - BTC→ETH→USDT→BTC 循环
   - 检测三角不等式
   - 阈值: >0.3%

3. **统计套利** (3 Agent)
   - 协整关系 (如 BTC/ETH 价格比)
   - 均值回归策略
   - 需要历史数据回测

4. **新闻驱动套利** (2 Agent)
   - 监控新闻、社交媒体
   - NLP 情感分析
   - 预判价格波动

**信号消息格式**:
```json
{
  "type": "signal",
  "strategy": "cross_exchange_arbitrage",
  "symbol": "BTC/USDT",
  "action": "buy",
  "exchange": "binance",
  "price": 67500.50,
  "quantity": 0.1,
  "estimatedProfit": 15.25,
  "riskLevel": "low",
  "confidence": 0.85,
  "expiresAt": 1740441960000
}
```

#### 2.3.3 RiskManager (风控)

**数量**: 20个 (并行评估，降低延迟)

**职责**:
- 订阅 `commands:risk`
- 计算风险指标
- 返回风险评分
- 大额交易需多个风控 Agent 投票

**风险评估维度**:
- 单笔风险: 预期亏损 >5U → 高风险
- 仓位集中度: 同一币种仓位 >20% → 警告
- 交易所暴露: 单交易所资产 >50% → 警告
- 市场波动: 最近1小时波动率 >5% → 提高阈值

**返回**:
```json
{
  "type": "risk_assessment",
  "signalId": "sig_123",
  "riskLevel": "low|medium|high",
  "score": 0.35, // 0-1, 越低越安全
  "reasons": [
    "单笔预期亏损 < 5U",
    "仓位分散良好"
  ],
  "suggestedAdjustments": {
    "quantity": 0.08 // 建议减少数量
  }
}
```

#### 2.3.4 TraderAgent (交易执行)

**数量**: 40个 (按交易所和策略类型分配)

**职责**:
- 订阅 `commands:signal`
- 等待风控通过
- 执行订单
- 监控持仓，自动止盈止损
- 报告盈亏到 `events:trade`

**订单生命周期**:
```
1. 收到信号
2. 检查风控结果 (若未评估则先请求)
3. 预计算: 手续费、滑点、可用余额
4. 下单 (限价单或市价单)
5. 等待成交 (超时 5s)
6. 部分成交 → 调整剩余订单
7. 完全成交 → 记录持仓
8. 持仓监控 → 触发止盈止损/平仓
9. 记录盈亏 → 发布事件
```

**关键配置**:
```yaml
max_orders_per_second: 10
order_timeout_ms: 5000
partial_fill_threshold: 0.9  // 90% 算完全成交
stop_loss_percent: 0.05      // 5%
take_profit_percent: 0.10    // 10%
max_position_size_usd: 10000
```

#### 2.3.5 MonitorAgent (系统监控)

**数量**: 20个 (每10个 Agent 分1个监控)

**职责**:
- 心跳检测: 每5秒 ping 所有 Agent
- 收集指标: CPU、内存、延迟、队列长度
- 异常检测: 延迟突增、错误率上升
- 告警: 通过 `events:alert` 通知

**健康检查**:
```javascript
async checkAgentHealth(agentId) {
  const lastHeartbeat = await this.redis.get(`agent:${agentId}:heartbeat`);
  const age = Date.now() - parseInt(lastHeartbeat);

  if (age > 30000) {
    await this.emitAlert({
      level: 'critical',
      message: `Agent ${agentId} 无响应 (${age}ms)`,
      agentId
    });
    await this.isolateAgent(agentId); // 隔离
  }
}
```

**指标收集** (Prometheus format):
```
# HELP agent_requests_total Total number of requests processed by agent
# TYPE agent_requests_total counter
agent_requests_total{agent="trader_001"} 1250

# HELP agent_latency_ms Average latency in milliseconds
# TYPE agent_latency_ms gauge
agent_latency_ms{agent="trader_001"} 12.5

# HELP agent_errors_total Total number of errors
# TYPE agent_errors_total counter
agent_errors_total{agent="trader_001"} 3
```

---

## 3. 数据流与状态管理

### 3.1 数据流图

```
[交易所API] → MarketDataAgent → events:market
                                    ↓
                              DataProcessorAgent
                                    ↓
                              SignalAgent → commands:signal
                                    ↓
                              RiskManager → commands:risk (请求)
                                    ↓ 响应
                              TraderAgent → 交易所API
                                    ↓
                              PositionAgent → events:position
                                    ↓
                              TradeLogger → DB
                                    ↓
                              AnalyticsAgent → 报表
```

### 3.2 状态存储

**Redis Key 设计**:

| Key 模式 | 类型 | TTL | 描述 |
|----------|------|-----|------|
| `agent:{id}:heartbeat` | String | 60s | 心跳 |
| `agent:{id}:state` | Hash | - | 运行时状态 |
| `agent:{id}:stats` | Hash | - | 统计信息 |
| `trade:{id}` | Hash | 24h | 交易记录 |
| `position:{agent}:{symbol}` | Hash | - | 持仓 |
| `signal:pending` | Sorted Set | 1h | 待处理信号 (按时间排序) |
| `order:{id}` | Hash | 24h | 订单 |
| `tenant:{id}:balance` | Hash | - | 用户余额 |

### 3.3 持久化策略

- **热数据** (最近1小时): Redis
- **温数据** (1天-30天): PostgreSQL
- **冷数据** (>30天): 压缩归档到 S3

**数据同步**: 使用 Debezium CDC 或应用层双写

---

## 4. 自进化系统

### 4.1 进化维度

1. **参数调优**: 调整阈值、时间窗口、权重
2. **策略迭代**: 淘汰低效策略，引入新策略
3. **资源分配**: 动态调整 Agent 数量
4. **拓扑优化**: 调整 Agent 间连接关系

### 4.2 进化算法

**遗传算法**:

```
种群: 当前所有 Agent 的配置参数
适应度函数: (成功率 × 0.4 + 收益率 × 0.3 - 延迟 × 0.2 - 资源消耗 × 0.1)
选择: 轮盘赌选择前 20%
交叉: 两个父代的参数随机组合 (概率 0.7)
变异: 随机调整参数 (概率 0.1, 幅度 10%)
```

**流程**:
1. 每日 02:00 收集前一天的 Agent 表现
2. 计算每个 Agent 的适应度
3. 生成新一代配置
4. 克隆新 Agent，应用新配置
5. 新老并行运行 1 天 (A/B 测试)
6. 比较表现，决定迁移或回滚

### 4.3 安全熔断

**条件**:
- 连续 3 次进化后指标下降 >5%
- 单日总亏损 > 总资金的 2%
- 异常行为检测 (如频繁撤单)

**动作**:
- 暂停进化 7 天
- 回滚到上一个稳定版本
- 通知 C李白 人工审查

---

## 5. 安全与合规

### 5.1 多租户隔离

**策略**: 每个租户 (用户/组织) 有独立的数据库 Schema 或独立数据库

**实现**:
```sql
-- 共享数据库，独立 schema
CREATE SCHEMA tenant_001;
SET search_path TO tenant_001, public;

-- 或独立数据库
DATABASE libai_trading_tenant_001
```

**应用层**:
- 所有查询强制附加 `tenant_id = ?`
- Redis Key 前缀 `tenant:{id}:`
- 消息队列隔离: `events:market:tenant_{id}`

### 5.2 API 安全

- JWT 过期 24h
- 刷新令牌 7天
- 速率限制: 1000 req/min per user
- IP 白名单 (企业版)
- 操作日志完整审计

### 5.3 交易所安全

- 仅请求 "交易" 和 "读取" 权限，**不申请提现**
- API Key 轮换: 90天
- IP 绑定: 仅允许服务器 IP
- 子账号机制: 每个用户独立子账号 (如交易所支持)

---

## 6. 性能目标

### 6.1 延迟 (p95)

| 操作 | 目标 | 可接受 |
|------|------|--------|
| 市场数据处理 | 50ms | 100ms |
| 信号生成 | 80ms | 150ms |
| 风险评估 | 20ms | 50ms |
| 订单执行 | 150ms | 300ms |
| 端到端 | 200ms | 400ms |

### 6.2 吞吐量

- 市场数据: 10,000 msg/s
- 信号生成: 100 sig/s
- 订单执行: 50 order/s
- 总消息吞吐: >20,000 msg/s

### 6.3 资源利用率 (单节点)

- CPU: 70-80%
- 内存: 75%
- 网络: 50%
- 磁盘 IO: 50%

---

## 7. 部署拓扑

### 7.1 单节点 (当前)

```
┌─────────────────────────────────────┐
│          VPS (4核8G)                │
│  ┌─────────┐  ┌─────────┐         │
│  │ Node.js │  │ Python  │         │
│  │ (主系统)│  │ (Bot)   │         │
│  └─────────┘  └─────────┘         │
│  ┌─────────────────────┐          │
│  │    PostgreSQL       │          │
│  └─────────────────────┘          │
│  ┌─────────────────────┐          │
│  │      Redis          │          │
│  └─────────────────────┘          │
└─────────────────────────────────────┘
```

### 7.2 集群 (Phase 2)

```
┌────────────┐    ┌────────────┐
│   Node 1   │    │   Node 2   │
│  (Trader)  │    │ (Risk)     │
└────────────┘    └────────────┘
        │                │
        └───────┬────────┘
                │
         ┌──────▼──────┐
         │  Load Balancer │
         └──────┬──────┘
                │
         ┌──────▼──────┐
         │  PostgreSQL │
         │   (主从)    │
         └─────────────┘
         ┌─────────────┐
         │    Redis    │
         │  (哨兵)     │
         └─────────────┘
```

---

## 8. 实施路线图

### Phase 1 (当前 - 1个月)
- [x] 架构设计 (本文件)
- [ ] 实现通信层 (Redis Streams 封装)
- [ ] 实现 BaseAgent 基类
- [ ] 实现 6 个 MarketDataAgent
- [ ] 实现 10 个 SignalAgent (4种策略)
- [ ] 实现 20 个 RiskManager
- [ ] 实现 40 个 TraderAgent
- [ ] 集成测试

### Phase 2 (1-2个月)
- [ ] 实现 MonitorAgent + 告警
- [ ] 实现 KnowledgeAgent + 向量检索
- [ ] 实现自进化系统
- [ ] 性能调优至目标
- [ ] 压力测试 20K TPS

### Phase 3 (2-3个月)
- [ ] 集群部署 (2节点)
- [ ] 多租户支持
- [ ] 移动端 API
- [ ] 生产环境部署
- [ ] 首批 10 个付费用户

---

## 9. 测试策略

### 9.1 单元测试

```javascript
describe('RiskManager', () => {
  test('should return low risk for small position', () => {
    const risk = await manager.assess({
      quantity: 0.01,
      price: 67000,
      maxLoss: 2
    });
    expect(risk.level).toBe('low');
  });
});
```

**覆盖率目标**: 80%

### 9.2 集成测试

- 模拟市场数据流 → 信号 → 风控 → 交易全流程
- 使用内存 Redis (fakeredis) 隔离测试

### 9.3 性能测试

```bash
# 使用 autocannon
autocannon -c 100 -d 30 http://localhost:3000/health

# 使用 k6
k6 run --vus 1000 --duration 30s scripts/load-test.js
```

**验收标准**:
- p95 < 200ms
- 错误率 < 0.1%
- 无内存泄漏

---

## 10. 监控与运维

### 10.1 关键指标

| 指标 | 类型 | 告警阈值 |
|------|------|----------|
| agent_heartbeat_missing | Gauge | >0 |
| agent_requests_total | Counter | - |
| agent_latency_ms | Histogram | p95 > 200 |
| agent_errors_total | Counter | 率 > 1% |
| queue_length | Gauge | > 1000 |
| trade_pnl_usd | Gauge | 日亏损 > $1000 |

### 10.2 告警等级

| 等级 | 触发条件 | 通知方式 |
|------|----------|----------|
| INFO | 常规事件 | 日志 |
| WARN | 性能下降 | Telegram |
| ERROR | 单个 Agent 故障 | Telegram + 邮件 |
| CRITICAL | 资金亏损 >$1000 | Telegram + 电话 |

### 10.3 运维命令

```bash
# 查看所有 Agent 状态
./scripts/agent status

# 重启特定 Agent
./scripts/agent restart trader_001

# 查看消息队列深度
redis-cli xlen events:market

# 消费死信队列
redis-cli xread streams:dlq
```

---

## 11. 下一步行动

1. **立即**: 实现 Redis Streams 通信层 (`lib/communication.js`)
2. **第1周**: 实现 BaseAgent 和 6 个 MarketDataAgent
3. **第2周**: 实现 SignalAgent (2种策略) 和 RiskManager
4. **第3周**: 实现 TraderAgent 和集成测试
5. **第4周**: 端到端测试，性能调优

---

**文档维护**: C李白
**下次评审**: 2026-04-06 (1周后)
**变更记录**: 本文件为最终版，重大变更需经 C李白 批准

---

**关键参考文件**:
- `multi-agent-coordination-v1.md` (基础)
- `multi-agent-advanced-v2.md` (高级)
- `system-optimization-v4-deep.md` (性能优化)
- `v24-architecture.json` (架构总览)
