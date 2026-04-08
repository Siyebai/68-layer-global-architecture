# 系统优化方案 V2 - 基础优化计划

**优先级**: 云端李白 优先阅读
**版本**: 2.0
**日期**: 2026-03-28

---

## 1. 优化目标

| 指标 | 当前 | 目标 (V2) | 目标 (V3) |
|------|------|-----------|-----------|
| Agent 数量 | 224 | 224 | 500 |
| 周期时间 | 0.21s | 0.18s | 0.12s |
| 平均延迟 | 27.5ms | 22ms | 15ms |
| 吞吐量 | 15,800/s | 25,000/s | 60,000/s |
| 系统可用性 | 99.8% | 99.9% | 99.95% |

---

## 2. 优化策略概览

### 2.1 优先级矩阵

| 优化项 | 难度 | 收益 | 优先级 | 预计工期 |
|--------|------|------|--------|----------|
| Redis 连接池调优 | 低 | 中 | P0 | 1天 |
| Node.js 集群模式 | 低 | 高 | P0 | 2天 |
| 消息批量处理 | 中 | 高 | P0 | 3天 |
| 数据库查询优化 | 中 | 中 | P1 | 3天 |
| 监控体系完善 | 中 | 低 | P1 | 2天 |
| 缓存策略优化 | 中 | 中 | P1 | 3天 |
| 代码热重载 | 高 | 低 | P2 | 5天 |

---

## 3. 详细优化方案

### 3.1 基础设施优化

#### 3.1.1 Node.js 集群化

**现状**: 单进程运行，仅用1核

**方案**: 使用 `cluster` 模块启动多进程

```javascript
const cluster = require('cluster');
const os = require('os');

if (cluster.isMaster) {
  const cpuCount = os.cpus().length;
  for (let i = 0; i < cpuCount; i++) {
    cluster.fork();
  }
  cluster.on('exit', (worker) => {
    console.log(`Worker ${worker.process.pid} 退出，重启中...`);
    cluster.fork();
  });
} else {
  // Worker 进程启动系统
  startSystem();
}
```

**收益**:
- CPU 利用率从 45% → 85%
- 吞吐量提升 2-3 倍
- 延迟降低 10-20%

**风险**: 共享状态需用 Redis 存储，避免进程间内存不一致

#### 3.1.2 Redis 连接池优化

**当前配置**:
```yaml
redis:
  max_clients: 10000  # 默认
```

**优化**:
```yaml
redis:
  max_clients: 20000
  tcp_keepalive: 60
  connect_timeout_ms: 5000
  command_timeout_ms: 2000
  retry_delay_on_timeout_ms: 100
  number_of_retries: 3
```

**代码层**:
```javascript
const redis = new Redis.Cluster([
  { host: '127.0.0.1', port: 6379 },
], {
  scaleReads: 'slave',
  maxRetriesPerRequest: 3,
  retryDelayOnFailover: 100,
  maxLoadingRetryTime: 3000
});
```

**收益**:
- 连接失败率从 0.5% → 0.01%
- 高并发下稳定性提升

#### 3.1.3 消息批处理

**现状**: 每条消息单独发送，Redis 往返延迟

**方案**: 批量发送 (每批 100 条，或每 50ms)

```javascript
class BatchPublisher {
  constructor(batchSize = 100, flushInterval = 50) {
    this.batchSize = batchSize;
    this.flushInterval = flushInterval;
    this.buffer = [];
    this.timer = null;
  }

  async add(message) {
    this.buffer.push(message);
    if (this.buffer.length >= this.batchSize) {
      await this.flush();
    } else if (!this.timer) {
      this.timer = setTimeout(() => this.flush(), this.flushInterval);
    }
  }

  async flush() {
    if (this.buffer.length === 0) return;
    const batch = this.buffer;
    this.buffer = [];
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    const pipeline = redis.pipeline();
    batch.forEach(msg => {
      pipeline.xadd(msg.stream, '*', 'data', JSON.stringify(msg));
    });
    await pipeline.exec();
  }
}
```

**收益**:
- 网络包减少 80%
- 吞吐量提升 30%
- Redis 负载降低

---

### 3.2 应用层优化

#### 3.2.1 缓存策略

**热点数据**: 交易所手续费、策略参数、用户权限

**缓存设计**:
```javascript
class SmartCache {
  constructor(ttl = 300) {
    this.ttl = ttl;
    this.local = new Map(); // 进程内缓存 (LRU)
    this.redis = redis;     // 分布式缓存
  }

  async get(key) {
    // 1. 查本地缓存
    if (this.local.has(key)) {
      return this.local.get(key);
    }

    // 2. 查 Redis
    const val = await this.redis.get(key);
    if (val) {
      this.local.set(key, val);
      return val;
    }

    // 3. 查数据库
    const data = await this.fetchFromDB(key);
    if (data) {
      await this.redis.setex(key, this.ttl, JSON.stringify(data));
      this.local.set(key, data);
    }
    return data;
  }

  async invalidate(key) {
    this.local.delete(key);
    await this.redis.del(key);
  }
}
```

**缓存内容**:
- 用户权限 (TTL 5m)
- 交易所手续费 (TTL 1h)
- 市场数据摘要 (TTL 10s)

#### 3.2.2 数据库连接池

**当前**: 未优化，可能连接不足或过多

**优化配置**:
```javascript
const { Pool } = require('pg');

const pool = new Pool({
  host: 'localhost',
  port: 5432,
  database: 'libai_trading',
  user: 'libai',
  password: 'libai123',
  max: 50,               // 最大连接数
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 5000,
  maxUses: 1000,         // 连接使用次数后重置
});
```

**监控**:
```sql
SELECT state, count(*) FROM pg_stat_activity GROUP BY state;
```

**预期**: 连接等待时间从 50ms → 5ms

---

### 3.3 监控与告警

#### 3.3.1 指标体系

**L1 指标** (必须监控):
- Agent 心跳丢失数
- 消息队列积压长度
- 订单执行失败率
- 资金盈亏

**L2 指标** (性能):
- p95/p99 延迟
- 吞吐量
- CPU/内存使用率
- 数据库连接池使用率

**L3 指标** (业务):
- 用户活跃数
- 订阅转化率
- MRR

#### 3.3.2 告警规则

```yaml
alerts:
  - name: AgentHeartbeatMissing
    expr: agent_heartbeat_missing > 0
    for: 1m
    severity: critical
    annotations:
      summary: "Agent {{ $labels.agent }} 无响应"
      description: "已超过30秒未收到心跳"

  - name: HighOrderFailureRate
    expr: rate(order_failures_total[5m]) / rate(order_requests_total[5m]) > 0.05
    for: 2m
    severity: warning
    annotations:
      summary: "订单失败率过高"

  - name: HighPnLLoss
    expr: daily_pnl_usd < -1000
    for: 1h
    severity: critical
    annotations:
      summary: "单日亏损超过 $1000"
```

---

### 3.4 部署优化

#### 3.4.1 使用 PM2 集群模式

**ecosystem.config.js 更新**:

```javascript
module.exports = {
  apps: [{
    name: 'libai-system',
    script: './scripts/ultimate-v24-autonomous.js',
    instances: 'max', // 自动根据CPU核心数
    exec_mode: 'cluster',
    autorestart: true,
    watch: false,
    max_memory_restart: '2G',
    env: {
      NODE_ENV: 'production',
      PORT: 3000
    }
  }]
};
```

#### 3.4.2 日志管理

**当前**: 所有日志输出到 stdout，PM2 捕获

**优化**:
- 使用 `winston` 或 `pino` 结构化日志
- 按天轮转: `logs/app-2026-03-30.log`
- 错误日志单独文件: `logs/error.log`
- 日志级别: production 用 `info`, debug 用 `debug`

```javascript
const winston = require('winston');

const logger = winston.createLogger({
  level: 'info',
  format: winston.format.json(),
  transports: [
    new winston.transports.File({ filename: 'logs/error.log', level: 'error' }),
    new winston.transports.File({ filename: 'logs/combined.log' }),
    new winston.transports.Console()
  ]
});
```

---

## 4. 优化实施计划

### Week 1: 基础设施
- [ ] 实现 Node.js 集群模式
- [ ] 优化 Redis 连接池配置
- [ ] 实现消息批处理
- [ ] 数据库连接池调优

### Week 2: 应用层
- [ ] 实现多级缓存
- [ ] 优化热点查询 (添加索引)
- [ ] 代码 profiling，消除瓶颈

### Week 3: 监控
- [ ] 部署 Prometheus + Grafana
- [ ] 配置关键指标仪表盘
- [ ] 设置告警规则
- [ ] 集成 Sentry 错误追踪

### Week 4: 测试与验证
- [ ] 性能基准测试 (与优化前对比)
- [ ] 压力测试至 25K TPS
- [ ] 故障注入测试 (网络延迟、进程 kill)
- [ ] 安全扫描

---

## 5. 预期收益

| 优化项 | 延迟改善 | 吞吐提升 | 资源节省 |
|--------|----------|----------|----------|
| Node.js 集群 | -15% | +120% | - |
| Redis 连接池 | -5% | +10% | - |
| 消息批处理 | -10% | +30% | - |
| 缓存策略 | -20% | +15% | - |
| 数据库优化 | -10% | +5% | - |
| **合计** | **-40%** | **+180%** | **CPU 利用率 +30%** |

**综合效果**:
- 延迟: 27.5ms → 16.5ms (超过目标 22ms)
- 吞吐: 15,800/s → 44,000/s (超过目标 25,000/s)
- 资源: 相同硬件可承载 2 倍负载

---

## 6. 风险与缓解

| 风险 | 概率 | 影响 | 缓解措施 |
|------|------|------|----------|
| 集群模式下状态不一致 | 中 | 高 | 所有状态外置 Redis，严格测试 |
| 缓存穿透 | 低 | 中 | 布隆过滤器，空值缓存 |
| Redis 内存不足 | 中 | 高 | 设置 maxmemory，LRU 淘汰 |
| 数据库连接泄漏 | 低 | 中 | 连接池监控，自动回收 |

---

## 7. 回滚方案

**任何优化导致性能下降 >5% 或错误率 >0.5%**，立即回滚:

1. 停止新版本进程
2. 恢复旧版配置文件
3. 重启旧版系统
4. 验证指标恢复
5. 分析问题，重新优化

---

## 8. 验收标准

- [ ] p95 延迟 < 22ms
- [ ] 吞吐量 > 25,000/s
- [ ] 系统可用性 > 99.9%
- [ ] 无内存泄漏 (24小时运行)
- [ ] 所有单元测试通过
- [ ] 性能测试报告完成

---

**负责人**: 云端李白 (优化实施)
**协同**: 本地李白 (性能测试)
**审批**: C李白 (最终验收)

**下一阶段**: 完成 V2 优化后，阅读 `system-optimization-v4-deep.md` 进行深化优化。
