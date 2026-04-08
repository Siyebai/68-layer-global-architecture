# 系统整合方案 V5 - 整体集成设计

**版本**: 5.0
**日期**: 2026-03-28
**状态**: 最终整合蓝图

---

## 1. 整合目标

将已完成的各个模块（Agent集群、套利变现、Telegram Bot、支付、网站）整合为一个**统一、可部署、可运维**的系统。

---

## 2. 系统边界

```
┌─────────────────────────────────────────────────────────────┐
│                      用户层 (Users)                         │
│  网站用户 | Telegram用户 | API调用者 | 管理员               │
├─────────────────────────────────────────────────────────────┤
│                    接入层 (Access Layer)                    │
│  Web Server (Nginx) | API Gateway | Telegram Webhook      │
├─────────────────────────────────────────────────────────────┤
│                   业务逻辑层 (Business Layer)               │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐    │
│  │  套利交易    │  │  用户管理    │  │  支付处理    │    │
│  │  (224 Agent) │  │  (User Mgmt) │  │  (Payment)   │    │
│  └──────────────┘  └──────────────┘  └──────────────┘    │
├─────────────────────────────────────────────────────────────┤
│                   数据层 (Data Layer)                       │
│  PostgreSQL (主数据) | Redis (缓存/队列) | S3 (备份)       │
├─────────────────────────────────────────────────────────────┤
│                 外部服务 (External Services)                │
│  10+ 交易所 | StepFun AI | Stripe | Telegram | Email      │
└─────────────────────────────────────────────────────────────┘
```

---

## 3. 整合架构

### 3.1 组件映射

| 模块 | 位置 | 依赖 | 被依赖 |
|------|------|------|--------|
| 自主进化系统 | `scripts/ultimate-v24-autonomous.js` | Redis, DB | 所有业务 |
| 用户管理 | `products/user-management.py` | DB | 支付, Telegram |
| Telegram Bot | `products/telegram-bot-system/bot.py` | API | 用户 |
| 支付集成 | `products/payment-integration/` | Stripe/Crypto API | 用户管理 |
| 网站源码 | `products/libai-arbitrage-starter/` | API | 用户 |
| 监控配置 | `config/monitoring-config.json` | Prometheus | 全系统 |

### 3.2 数据流整合

```
用户注册流程:
1. 用户访问网站 → 提交邮箱密码
2. 网站调用 POST /api/v1/users → UserManager.create_user()
3. UserManager 写入 PostgreSQL
4. 生成 API Key 和 JWT
5. 发送欢迎邮件 (via Email Service)
6. 通知 Telegram Bot → 发送欢迎消息

购买流程:
1. 用户选择套餐 → 跳转 Stripe/加密货币支付
2. 支付成功 → Stripe Webhook → PaymentProcessor.handle_webhook()
3. PaymentProcessor 调用 UserManager.assign_package()
4. UserManager 更新订阅状态
5. Telegram Bot 发送付款确认
6. 发送收据邮件

套利交易流程:
1. MarketDataAgent 采集交易所数据 → Redis Streams
2. SignalAgent 生成信号 → 评估风险
3. RiskManager 风控评分
4. TraderAgent 执行订单 → 交易所API
5. PositionAgent 监控持仓 → 止盈止损
6. TradeLogger 记录 → PostgreSQL
7. AnalyticsAgent 生成日报
8. Telegram Bot 推送通知
```

---

## 4. 接口规范

### 4.1 REST API

**基路径**: `/api/v1`

**认证**: `Authorization: Bearer <jwt_token>` 或 `X-API-Key: <key>`

**通用响应**:
```json
{
  "success": true,
  "data": {},
  "error": null,
  "timestamp": "2026-03-30T10:00:00Z"
}
```

**主要端点**:

| 方法 | 路径 | 描述 | 权限 |
|------|------|------|------|
| POST | /users | 创建用户 | public |
| POST | /auth/login | 登录 | public |
| GET | /users/me | 当前用户信息 | user |
| PATCH | /users/me | 更新用户 | user |
| GET | /subscriptions | 订阅列表 | user |
| POST | /subscriptions | 创建订阅 | user |
| GET | /trades | 交易历史 | user |
| GET | /performance | 绩效报告 | user |
| GET | /status | 系统状态 | admin |
| POST | /admin/announce | 公告 | admin |

### 4.2 WebSocket

**路径**: `/ws`

**协议**: JSON 消息

**认证**: 连接时发送 `{"type":"auth","token":"..."}`

**消息类型**:

| 方向 | 类型 | 描述 |
|------|------|------|
| → 服务端 | subscribe | 订阅频道 (如 "trades:user_001") |
| → 服务端 | ping | 心跳 |
| ← 客户端 | trade_executed | 交易执行通知 |
| ← 客户端 | signal_generated | 新信号 |
| ← 客户端 | alert | 系统告警 |

---

## 5. 部署整合

### 5.1 单节点部署 (当前)

```
/root/.openclaw/workspace/libai-workspace/
├── .env                  # 环境变量
├── ecosystem.config.js   # PM2 配置
├── scripts/
│   ├── ultimate-v24-autonomous.js  # 主系统
│   ├── start.sh
│   └── test-core.js
├── products/
│   ├── telegram-bot-system/bot.py
│   └── ...
├── config/
└── logs/                 # PM2 自动生成
```

**启动**:
```bash
pm2 start ecosystem.config.js
pm2 save
pm2 startup
```

### 5.2 容器化部署 (Phase 2)

**Dockerfile**:
```dockerfile
FROM node:18-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production
COPY . .
RUN npm run build

FROM node:18-alpine
WORKDIR /app
COPY --from=builder /app ./
EXPOSE 3000
CMD ["node", "scripts/ultimate-v24-autonomous.js"]
```

**docker-compose.yml**:
```yaml
version: '3.8'
services:
  app:
    build: .
    ports:
      - "3000:3000"
    environment:
      - NODE_ENV=production
      - DATABASE_URL=postgresql://postgres:password@db:5432/libai_trading
      - REDIS_URL=redis://redis:6379
    depends_on:
      - db
      - redis
    restart: always

  db:
    image: postgres:16
    environment:
      POSTGRES_PASSWORD: password
      POSTGRES_DB: libai_trading
    volumes:
      - postgres_data:/var/lib/postgresql/data
    restart: always

  redis:
    image: redis:7-alpine
    command: redis-server --appendonly yes
    volumes:
      - redis_data:/data
    restart: always

  nginx:
    image: nginx:alpine
    ports:
      - "80:80"
      - "443:443"
    volumes:
      - ./nginx.conf:/etc/nginx/nginx.conf
      - ./ssl:/etc/nginx/ssl
    depends_on:
      - app
    restart: always

volumes:
  postgres_data:
  redis_data:
```

---

## 6. 配置管理

### 6.1 环境变量清单

已定义在 `.env.example`，包含:
- 系统配置 (PORT, NODE_ENV)
- API 密钥 (StepFun, Stripe, 交易所)
- 数据库连接
- 邮件服务
- 监控配置

### 6.2 配置文件热重载

**方案**: 监控文件变化，自动重启

```javascript
const fs = require('fs');

fs.watch('config/production.yaml', (eventType, filename) => {
  if (eventType === 'change') {
    console.log('配置文件变更，重新加载...');
    loadConfig(); // 重新加载配置
    // 通知相关 Agent 更新配置
  }
});
```

---

## 7. 数据迁移

### 7.1 数据库迁移

使用 `node-pg-migrate` 或 `alembic` (Python)

**示例迁移**:
```javascript
exports.up = async (pgm) => {
  await pgm.createTable('users', {
    id: { type: 'varchar(32)', primary: true },
    email: { type: 'varchar(255)', notNull: true, unique: true },
    password_hash: { type: 'text', notNull: true },
    created_at: { type: 'timestamp', notNull: true, default: pgm.func('now()') }
  });

  await pgm.createTable('subscriptions', {
    id: { type: 'serial', primary: true },
    user_id: { type: 'varchar(32)', notNull: true },
    package_id: { type: 'varchar(50)', notNull: true },
    start_date: { type: 'timestamp', notNull: true },
    end_date: { type: 'timestamp', notNull: true }
  });
};

exports.down = async (pgm) => {
  await pgm.dropTable('subscriptions');
  await pgm.dropTable('users');
};
```

**执行**:
```bash
npx pg-migrate up
```

---

## 8. 监控整合

### 8.1 指标收集

- **Node.js**: `prom-client` 暴露 `/metrics`
- **Python**: `prometheus_client` 暴露 `/metrics`
- **PostgreSQL**: `postgres_exporter`
- **Redis**: `redis_exporter`

**Prometheus 配置**:
```yaml
scrape_configs:
  - job_name: 'libai-system'
    static_configs:
      - targets: ['localhost:3000']
  - job_name: 'postgres'
    static_configs:
      - targets: ['localhost:9187']
  - job_name: 'redis'
    static_configs:
      - targets: ['localhost:9121']
```

### 8.2 日志聚合

使用 **Loki** 或 **ELK**:

```javascript
// Winston 输出到 Loki
const LokiTransport = require('winston-loki');
const logger = winston.createLogger({
  transports: [
    new LokiTransport({
      host: 'localhost',
      port: 3100,
      labels: { service: 'libai-system' }
    })
  ]
});
```

---

## 9. 测试整合

### 9.1 端到端测试流程

```
1. 启动测试环境 (docker-compose -f docker-compose.test.yml up)
2. 创建测试用户
3. 模拟市场数据流 (使用 fixtures)
4. 触发套利信号
5. 验证订单创建
6. 验证持仓更新
7. 验证通知发送
8. 清理环境
```

**工具**: Playwright (前端) + Supertest (API) + 自定义 Agent 模拟

### 9.2 数据验证

**一致性检查**:
```sql
-- 检查订单与持仓是否匹配
SELECT user_id, symbol,
       SUM(CASE WHEN side='buy' THEN quantity ELSE -quantity END) AS net_position
FROM trades
GROUP BY user_id, symbol
HAVING net_position != 0;
```

---

## 10. 回滚策略

### 10.1 版本管理

- 使用 Git Tag: `v24.0.0`, `v24.1.0`
- 镜像标签: `libai-system:v24.0.0`
- 数据库迁移版本化

### 10.2 回滚步骤

1. 停止当前版本: `pm2 stop all`
2. 切换代码: `git checkout v24.0.0`
3. 回滚数据库: `npx pg-migrate down`
4. 重启旧版本: `pm2 start ecosystem.config.js`
5. 验证功能

**时间窗口**: 回滚应在 5 分钟内完成

---

## 11. 上线清单

- [ ] 所有环境变量配置正确
- [ ] 数据库迁移已执行
- [ ] Redis 连接测试通过
- [ ] HTTPS 证书已配置 (Nginx)
- [ ] 域名解析已生效
- [ ] 监控仪表盘配置完成
- [ ] 告警规则已启用
- [ ] 备份策略已验证
- [ ] 防火墙规则已设置
- [ ] 团队成员已通知
- [ ] 文档已更新 (部署位置、配置)

---

## 12. 后续优化

整合完成后，进入深化优化阶段 (`system-optimization-v4-deep.md`):

- 性能优化 (目标 60K TPS)
- 多区域部署
- 灰度发布系统
- 安全加固

---

**负责人**: C李白 (整合协调) + 本地李白 (实施)  
**协同**: 云端李白 (基础设施)  
**时间预估**: 2-3 天完成整合，1周稳定运行

**下一步**: 按本章方案执行整合，完成后进入 `system-construction-v6.md` 建设阶段。
