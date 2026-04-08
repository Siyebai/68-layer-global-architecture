# 系统优化 V4 - 深化优化方案

**版本**: 4.0 (深度优化)
**日期**: 2026-03-28
**阅读顺序**: 本地李白 优先阅读 (after V3)

---

## 1. 优化背景

V3 完成基础架构后，性能已达标 (p95 < 200ms, 吞吐 > 15K/s)。但为了支撑 **500 Agent** 和 **60K TPS** 的长期目标，需要更深层次的优化。

---

## 2. 深度优化策略

### 2.1 内存优化

#### 2.1.1 对象池化

**问题**: 频繁创建/销毁对象导致 GC 压力

**方案**: 复用对象

```javascript
class ObjectPool {
  constructor(createFn, resetFn, maxSize = 1000) {
    this.pool = [];
    this.createFn = createFn;
    this.resetFn = resetFn;
    this.maxSize = maxSize;
  }

  acquire() {
    if (this.pool.length > 0) {
      return this.pool.pop();
    }
    return this.createFn();
  }

  release(obj) {
    this.resetFn(obj);
    if (this.pool.length < this.maxSize) {
      this.pool.push(obj);
    }
  }
}

// 使用
const messagePool = new ObjectPool(
  () => ({ id: uuid(), timestamp: Date.now() }),
  msg => { delete msg.payload; msg.id = null; }
);

// 每次处理消息
const msg = messagePool.acquire();
// ... 使用
messagePool.release(msg);
```

**收益**: GC 次数减少 60%，内存碎片降低

#### 2.1.2 内存泄露检测

使用 `heapdump` 或 `clinic.js` 定期抓取堆快照，分析对象 retained size。

```bash
# 安装
npm install -g clinic

# 运行并分析
clinic doctor -- node scripts/ultimate-v24-autonomous.js
```

**重点关注**:
- 闭包引用
- 事件监听器未移除
- 全局 Map 无限增长

---

### 2.2 CPU 优化

#### 2.2.1 算法复杂度降低

**问题**: 某些 Agent 使用 O(n²) 算法 (如嵌套循环查找机会)

**优化**:
- 使用哈希表将查找降至 O(1)
- 空间换时间

**例子**: 跨交易所套利需要匹配买卖对

**原算法** (O(n²)):
```javascript
for (const binanceOrder of binanceOrders) {
  for (const okxOrder of okxOrders) {
    if (binanceOrder.symbol === okxOrder.symbol) {
      // 计算价差
    }
  }
}
```

**优化后** (O(n)):
```javascript
const okxMap = new Map(okxOrders.map(o => [o.symbol, o]));
for (const binanceOrder of binanceOrders) {
  const okxOrder = okxMap.get(binanceOrder.symbol);
  if (okxOrder) {
    // 计算价差
  }
}
```

**收益**: 处理 1000 个订单从 10ms → 0.5ms

#### 2.2.2 异步化所有 I/O

**原则**: 任何可能阻塞的操作必须异步

**检查清单**:
- [ ] 文件读写 → `fs.promises`
- [ ] 网络请求 → `axios`/`fetch` 本身异步 OK
- [ ] 数据库查询 → 使用异步驱动 (pg, ioredis)
- [ ] CPU 密集型计算 → 转移到 Worker Threads

**Worker Threads 示例**:
```javascript
// 主线程
const { Worker } = require('worker_threads');
function runHeavyComputation(data) {
  return new Promise((resolve, reject) => {
    const worker = new Worker('./workers/compute.js');
    worker.postMessage(data);
    worker.on('message', resolve);
    worker.on('error', reject);
  });
}

// worker.js (独立文件)
const { parentPort } = require('worker_threads');
parentPort.on('message', (data) => {
  const result = heavyAlgorithm(data);
  parentPort.postMessage(result);
});
```

**适用场景**: 信号生成中的复杂数学计算、机器学习推理

---

### 2.3 网络优化

#### 2.3.1 连接复用

**问题**: 每个 Agent 新建 HTTP 连接 → 握手开销

**方案**: 使用 `keep-alive` 和连接池

```javascript
const axios = require('axios');
const https = require('https');

const agent = new https.Agent({
  keepAlive: true,
  maxSockets: 50,        // 每个主机最大连接
  maxFreeSockets: 10,    // 空闲连接池大小
  keepAliveMsecs: 60000, // 保活 60s
});

const client = axios.create({ httpsAgent: agent });
```

#### 2.3.2 压缩传输

**场景**: 大 payload (K线数据、订单簿)

**方案**: 使用 gzip 或 MessagePack

```javascript
const msgpack = require('msgpackr');
const encoder = new msgpack();

// 发送前压缩
const packed = encoder.encode(largeObject);
await redis.xadd('stream', '*', 'data', packed.toString('base64'));

// 接收端解压
const buffer = Buffer.from(data, 'base64');
const obj = encoder.decode(buffer);
```

**收益**: 数据量减少 50-70%

#### 2.3.3 CDN 静态资源

网站图片、CSS、JS 使用 CDN，减少服务器负载。

---

### 2.4 存储优化

#### 2.4.1 数据库索引

**慢查询分析**:
```sql
-- 开启 pg_stat_statements
CREATE EXTENSION pg_stat_statements;

-- 查看最慢的查询
SELECT query, calls, total_time, mean_time
FROM pg_stat_statements
ORDER BY total_time DESC
LIMIT 10;
```

**添加索引**:
```sql
-- 常用查询字段
CREATE INDEX idx_trades_created_at ON trades(created_at);
CREATE INDEX idx_trades_tenant_id ON trades(tenant_id);
CREATE INDEX idx_trades_symbol ON trades(symbol);

-- 复合索引 (覆盖查询)
CREATE INDEX idx_trades_tenant_created ON trades(tenant_id, created_at DESC);
```

**索引策略**:
- WHERE 条件字段 → 单列索引
- JOIN 字段 → 索引
- ORDER BY + WHERE → 复合索引
- 区分度高的字段优先 (如 tenant_id, symbol)

#### 2.4.2 分库分表

**触发条件**: 单表 > 1000 万行

**方案**: 按 tenant_id 水平分片

```
trades_001, trades_002, ..., trades_100
```

**路由**:
```javascript
const shardId = tenantId % 100;
const tableName = `trades_${shardId.toString().padStart(3, '0')}`;
```

**工具**: 使用 Vitess 或应用层分片

#### 2.4.3 时序数据优化

**问题**: 市场数据增长极快 (每秒数千条)

**方案**: 使用 TimescaleDB (PostgreSQL 扩展)

```sql
-- 创建超表
CREATE TABLE market_data (
  time TIMESTAMPTZ NOT NULL,
  symbol TEXT NOT NULL,
  exchange TEXT NOT NULL,
  bid DOUBLE PRECISION,
  ask DOUBLE PRECISION,
  volume DOUBLE PRECISION
);
SELECT create_hypertable('market_data', 'time');

-- 自动分片 (按 7 天)
SELECT add_retention_policy('market_data', INTERVAL '90 days');
```

**收益**: 查询性能提升 10 倍，存储压缩 50%

---

### 2.5 缓存策略深化

#### 2.5.1 多级缓存

```
L1: 进程内缓存 (Map) - 1ms
L2: Redis 集群 - 5ms
L3: 数据库 - 50ms
```

**实现**:
```javascript
class MultiLevelCache {
  async get(key) {
    // L1
    if (this.l1.has(key)) return this.l1.get(key);

    // L2
    const val = await this.redis.get(key);
    if (val) {
      this.l1.set(key, val);
      return val;
    }

    // L3
    const data = await this.db.query('SELECT * FROM cache WHERE key = $1', [key]);
    if (data) {
      await this.redis.setex(key, 300, JSON.stringify(data));
      this.l1.set(key, data);
    }
    return data;
  }
}
```

**缓存失效**:
- 写穿透: 更新 DB 后同时更新缓存
- TTL: 所有缓存设置过期时间，避免陈旧数据
- 主动失效: 关键数据变更时主动删除缓存

#### 2.5.2 热点 key 处理

**问题**: 某些 key (如 BTC/USDT 价格) 访问量极大

**方案**: 本地缓存 + 短 TTL

```javascript
class HotspotCache {
  constructor() {
    this.local = new Map();
    this.ttl = 1000; // 1秒
  }

  async getPrice(symbol) {
    const key = `price:${symbol}`;
    const now = Date.now();

    if (this.local.has(key)) {
      const { value, expire } = this.local.get(key);
      if (now < expire) return value;
    }

    // 从 Redis 获取
    const price = await this.redis.get(key);
    this.local.set(key, { value: price, expire: now + this.ttl });
    return price;
  }
}
```

---

## 3. 代码级优化

### 3.1 减少序列化

**问题**: JSON.stringify/parse 开销大

**方案**: 使用二进制协议 (MessagePack, Protobuf)

**对比**:

| 格式 | 1000条消息大小 | 序列化时间 | 反序列化时间 |
|------|----------------|------------|--------------|
| JSON | 100KB | 2ms | 3ms |
| MessagePack | 50KB | 1ms | 1.5ms |
| Protobuf | 40KB | 0.8ms | 1ms |

**迁移成本**: 需修改所有消息格式，兼容性考虑 (可双格式支持)

### 3.2 避免阻塞循环

**坏代码**:
```javascript
while (true) {
  const msg = await redis.xread(...);
  process(msg);
}
```

**好代码**:
```javascript
async function processStream() {
  while (running) {
    try {
      const resp = await redis.xread({ key: 'stream', count: 100, block: 1000 });
      if (resp) {
        await Promise.all(resp.map(m => processMessage(m)));
      }
    } catch (err) {
      logger.error('Stream error', err);
      await sleep(1000); // 避免 tight loop
    }
  }
}
```

---

## 4. 监控深化

### 4.1 分布式追踪

**目标**: 一个请求的全链路延迟分解

**实现**: OpenTelemetry

```javascript
const { NodeSDK } = require('@opentelemetry/sdk-node');
const { trace } = require('@opentelemetry/api');

const sdk = new NodeSDK();
sdk.start();

const tracer = trace.getTracer('libai-system');

// 使用
const span = tracer.startSpan('process_signal');
span.setAttribute('signal.id', signalId);
try {
  await doWork();
  span.setStatus({ code: trace.StatusCode.OK });
} catch (err) {
  span.recordException(err);
  span.setStatus({ code: trace.StatusCode.ERROR });
} finally {
  span.end();
}
```

**收集到 Jaeger**，可视化追踪链。

### 4.2 业务指标

除了技术指标，还需监控业务健康度:

- **信号质量**:
  - 信号成功率 (执行比例)
  - 平均 ROI per signal
  - 信号到成交延迟

- **用户行为**:
  - 注册 → 试用 → 付费转化率
  - 用户留存 (1日、7日、30日)
  - 功能使用频率

- **收入指标**:
  - MRR, ARR
  - LTV, CAC
  - Churn rate

---

## 5. 容灾与高可用

### 5.1 多区域部署 (Phase 3)

```
Region A (新加坡)       Region B (东京)
    ┌─────────┐            ┌─────────┐
    │  Node 1 │            │  Node 1 │
    │  Node 2 │            │  Node 2 │
    └─────────┘            └─────────┘
          │                      │
          └──────┬───────────────┘
                 │ 跨区域复制
          ┌──────▼──────┐
          │   Global    │
          │ Load Balancer│
          └─────────────┘
```

**数据同步**:
- 主区域写入，从区域只读
- 使用 PostgreSQL 逻辑复制
- Redis 主从 + 哨兵

**故障转移**:
- 主区域宕机 → DNS 切换到从区域
- 数据差异容忍: 最近 5 分钟数据可能丢失 (异步复制)

### 5.2 灰度发布

**策略**:
- 10% 用户 → 新版本
- 监控指标 24h
- 无异常 → 50% → 100%
- 异常 → 回滚

**实现**:
```javascript
const version = process.env.APP_VERSION;
const canaryRate = 0.1; // 10%

function shouldUseNewVersion(userId) {
  const hash = hashString(userId);
  return hash % 100 < canaryRate * 100;
}
```

---

## 6. 测试深化

### 6.1 混沌工程

**目标**: 验证系统容错能力

**实验**:
1. 随机 kill Agent 进程 → 验证自动恢复
2. 注入网络延迟 (100ms, 500ms) → 验证超时处理
3. 填充磁盘 → 验证写失败处理
4. Redis 断连 → 验证降级模式

**工具**: Chaos Mesh (K8s) 或自定义脚本

### 6.2 长期运行测试

**稳定性测试**: 运行 7 天，监控:
- 内存增长 (应平稳)
- 连接数 (应稳定)
- 错误率 (应接近 0)

**发现内存泄露**: 对比第1天和第7天的堆快照

---

## 7. 安全深化

### 7.1 零信任网络

**原则**: 内部通信也需认证

**实现**:
- 每个 Agent 有 TLS 证书
- mTLS 双向认证
- 服务网格 (Istio) 管理策略

**简化版** (当前):
- Redis 密码认证
- API JWT 签名验证
- 内部 API 加 IP 白名单

### 7.2 审计日志

**记录所有敏感操作**:
- 用户登录/登出
- 权限变更
- 资金操作 (充值、提现、交易)
- 配置修改

**日志格式**:
```json
{
  "timestamp": "2026-03-30T10:00:00Z",
  "actor": "user_001",
  "action": "place_order",
  "resource": "order_123",
  "ip": "192.168.1.1",
  "user_agent": "...",
  "before": { "status": "pending" },
  "after": { "status": "filled" }
}
```

**存储**: 只追加，不可删除，保存 7 年 (合规)

---

## 8. 实施路线图 (V4 深化)

### Month 1
- [ ] 对象池化实现
- [ ] Worker Threads 引入
- [ ] MessagePack 序列化
- [ ] 数据库索引优化
- [ ] 多级缓存

### Month 2
- [ ] OpenTelemetry 集成
- [ ] TimescaleDB 时序数据迁移
- [ ] 混沌工程测试
- [ ] 长期稳定性测试

### Month 3
- [ ] 灰度发布系统
- [ ] 多区域部署 PoC
- [ ] 安全审计与修复
- [ ] 文档更新

---

## 9. 验收标准

### 性能
- [ ] p95 延迟 < 15ms
- [ ] 吞吐量 > 60,000/s
- [ ] CPU 利用率 80-85%
- [ ] 内存使用稳定 (24h 增长 < 5%)

### 可用性
- [ ] 系统可用性 > 99.95%
- [ ] 自动故障恢复 < 30s
- [ ] 灰度发布零事故

### 安全
- [ ] 无高危漏洞 (通过安全扫描)
- [ ] 审计日志完整
- [ ] 通过渗透测试 (可选)

---

## 10. 风险控制

| 优化项 | 风险 | 缓解 |
|--------|------|------|
| 多级缓存 | 数据不一致 | 明确缓存失效策略，关键数据不缓存 |
| 分库分表 | 查询复杂化 | 使用中间件，应用无感知 |
| mTLS | 运维复杂度 | 自动化证书管理 (cert-manager) |
| 多区域 | 数据一致性 | 最终一致性，明确 SLA |

---

**负责人**: 本地李白 (技术实施) + 云端李白 (架构评审)  
**监督**: C李白  
**参考文档**: `multi-agent-complete-v3.md`, `v24-architecture.json`

---

**下一步**: 按路线图逐项实施，每周汇报进展。完成后进入 `system-construction-v6.md` 建设阶段。
