# 多智能体协作 V1 - 基础研究

**优先级**: 本地李白 优先阅读
**版本**: 1.0
**日期**: 2026-03-28

---

## 1. 多智能体系统概述

### 1.1 什么是多智能体系统 (MAS)

多个智能体 (Agent) 通过通信、协调、协作来完成单个智能体无法完成的任务。

**关键特性**:
- **自主性**: 每个 Agent 独立决策
- **社会性**: Agent 之间交互
- **反应性**: 对环境变化响应
- **目的性**: 为达成目标行动

### 1.2 协作模式

| 模式 | 描述 | 适用场景 | 例子 |
|------|------|----------|------|
| 竞争 | Agent 追求不同目标 | 拍卖、博弈 | 做市商竞争 |
| 合作 | Agent 共享目标 | 协同任务 | 订单匹配 |
| 混合 | 部分合作部分竞争 | 复杂生态系统 | 多交易所套利 |

---

## 2. 通信机制

### 2.1 通信类型

- **黑板系统** (Blackboard): 共享内存，所有 Agent 读写
- **消息传递** (Message Passing): 点对点或发布订阅
- **协议约定** (Protocol): 结构化对话 (如 ACL, FIPA)

**我们的选择**: Redis Streams (发布订阅模式)

```
Producer Agent → Redis Stream → Consumer Agent
```

优点:
- 解耦: 生产消费分离
- 缓冲: 应对流量峰值
- 持久化: 故障恢复
- 多消费者: 广播场景

### 2.2 消息格式

```json
{
  "id": "uuid",
  "type": "event|command|query",
  "timestamp": "2026-03-30T10:00:00Z",
  "sender": "agent_name",
  "recipient": "agent_name|broadcast",
  "payload": {
    "action": "create_order",
    "data": { ... }
  },
  "trace_id": "trace-uuid",
  "correlation_id": "corr-uuid"
}
```

---

## 3. 协调策略

### 3.1 任务分配

**市场机制**:
- Agent 竞价任务，价高者得
- 适合计算密集型任务

**合同网协议** (Contract Net):
- 管理器发布任务
- 执行者投标
- 管理器选择最优投标

**我们的实现**:
```javascript
// 任务发布
await redis.xadd('tasks:new', '*', 'type', 'arbitrage_opportunity', 'data', JSON.stringify(opportunity));

// Agent 竞争处理
const task = await redis.xread(['tasks:new', last_id]);
if (task) {
  // 计算成本
  const cost = estimateCost(task);
  // 竞价
  await redis.xadd('tasks:bids', '*', 'task_id', task.id, 'agent', this.name, 'cost', cost);
}
```

### 3.2 冲突解决

**投票机制**:
- 多个 Agent 对同一事件有不同意见
- 加权投票 (信誉分高的权重高)
- 多数决通过

**仲裁者模式**:
- 指定一个 Agent 作为仲裁者
- 仲裁者综合各方意见做最终决定
- 适用于风险决策

**我们的方案**: 混合模式
- 日常决策: 投票
- 重大决策 (大额交易): 需 C李白 人工确认

---

## 4. 组织结构

### 4.1 扁平式 vs 层次式

**扁平式**:
- 所有 Agent 平等
- 适合小规模 (<50)
- 通信复杂度 O(n²)

**层次式**:
- 分层管理 (管理层、执行层)
- 适合大规模 (>100)
- 通信复杂度 O(n log n)

**我们的选择**: 层次式 + 部分扁平

```
Level 1: 管理 Agent (C李白, 本地李白, 云端李白)
  ├── 决策 Agent (risk_manager, strategy_optimizer)
  ├── 监控 Agent (health_monitor, audit_logger)
Level 2: 执行 Agent (trader, data_processor, user_service)
  ├── 40个 trader (4交易所 × 10策略)
  ├── 30个 data_processor (市场、链上、舆情)
  └── 15个 user_service (用户管理、支持)
Level 3: 基础设施 Agent (database_manager, cache_manager, scheduler)
```

### 4.2 Agent 角色定义

```yaml
trader:
  count: 40
  subtypes:
    - spot_trader: 15
    - futures_trader: 15
    - arbitrage_trader: 10
  responsibilities:
    - 执行交易信号
    - 监控订单状态
    - 报告盈亏

risk_manager:
  count: 20
  responsibilities:
    - 评估交易风险
    - 设置止损止盈
    - 监控仓位暴露
    - 熔断控制

data_processor:
  count: 30
  responsibilities:
    - 采集市场数据
    - 清洗数据
    - 计算指标
    - 存储时序数据

monitor:
  count: 20
  responsibilities:
    - 系统健康检查
    - 性能指标收集
    - 异常检测
    - 告警通知
```

---

## 5. 协作流程设计

### 5.1 交易执行流程

```
1. MarketDataAgent → 采集各交易所价格
2. DataProcessorAgent → 清洗、标准化
3. SignalAgent → 计算套利机会
4. RiskAgent → 风险评估
5. 决策点:
   - 低风险 (<$100) → 自动执行
   - 中风险 ($100-$1000) → 需两个 trader 确认
   - 高风险 (>$1000) → 需 C李白 人工确认
6. OrderAgent → 下单
7. PositionAgent → 监控持仓
8. TradeLogger → 记录与分析
```

### 5.2 自进化机制

**周期**: 每日凌晨 2:00

**步骤**:
1. 收集昨日所有 Agent 表现数据
2. 评估每个 Agent 的 KPI:
   - 成功率
   - 平均盈亏
   - 响应延迟
   - 资源消耗
3. 遗传算法:
   - 选择表现最好的 20% Agent 作为父代
   - 交叉变异参数
   - 生成新一代 Agent 配置
4. 回测验证
5. A/B 测试 (新旧对比)
6. 逐步迁移 (金丝雀发布)

---

## 6. 故障处理

### 6.1 Agent 故障

**检测**: 心跳机制 (每5秒)
- MonitorAgent 发送心跳请求
- 超时未响应标记为故障

**恢复**:
- 自动重启 (PM2 负责)
- 状态恢复 (从 Redis 加载最后状态)
- 任务重新分配 (故障 Agent 的任务由其他 Agent 接管)

### 6.2 网络分区

**场景**: Redis 主从断开

**处理**:
- 切换到本地模式 (降级)
- 暂停跨 Agent 通信
- 仅保留核心交易功能
- 等待网络恢复后同步状态

---

## 7. 性能基准

### 7.1 延迟目标

| 阶段 | 目标 p95 (ms) | 当前 |
|------|---------------|------|
| 数据采集 | 50 | 45 |
| 信号生成 | 100 | 95 |
| 风险计算 | 20 | 18 |
| 订单执行 | 200 | 210 |
| 总周期 | 200 | 210 |

### 7.2 吞吐量目标

- 市场数据: 1000 msg/s
- 交易信号: 100 sig/s
- 订单执行: 50 order/s

当前: 15,800 msg/s 总吞吐，远超需求

---

## 8. 下一步行动

1. **实现通信层**: 封装 Redis Streams 客户端
2. **实现 Agent 基类**: 提供生命周期管理
3. **实现监控 Agent**: 健康检查 + 指标收集
4. **实现数据采集 Agent**: 对接交易所 API
5. **实现信号生成 Agent**: 套利算法
6. **实现风控 Agent**: 风险计算
7. **实现订单执行 Agent**: 下单逻辑
8. **集成测试**: 端到端流程验证

---

**阅读建议**: 先理解本章基础概念，再阅读 `multi-agent-advanced-v2.md` 深入研究高级主题。
