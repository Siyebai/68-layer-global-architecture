# 系统建设方案 V6 - 详细实施指南

**版本**: 6.0
**日期**: 2026-03-28
**状态**: 建设蓝图

---

## 1. 建设目标

在 V5 整合基础上，构建**生产就绪**的系统，包含完整的运维体系、安全加固、多租户支持、全球化部署能力。

---

## 2. 建设范围

| 领域 | 内容 | 负责人 |
|------|------|--------|
| 基础设施 | 服务器、网络、DNS、SSL | 云端李白 |
| 部署流水线 | CI/CD、容器化、配置管理 | 本地李白 |
| 监控体系 | 指标、日志、链路追踪、告警 | 本地李白 |
| 安全合规 | 认证、授权、审计、加密 | C李白 |
| 多租户 | 数据隔离、配额管理、自定义 | 本地李白 |
| 运维自动化 | 备份、恢复、扩缩容、迁移 | 云端李白 |
| 文档与培训 | 部署文档、运维手册、培训材料 | C李白 |

---

## 3. 基础设施建设

### 3.1 服务器规格

**单节点 (Phase 1)**:
- CPU: 4 核 (Intel Xeon 或 AMD EPYC)
- 内存: 8 GB DDR4
- 磁盘: 200 GB SSD (NVMe)
- 网络: 1 Gbps 带宽，延迟 < 50ms
- OS: Ubuntu 24.04 LTS

**集群 (Phase 2)**:
- 2 节点，规格同上
- 负载均衡器 (Nginx 或 HAProxy)
- 共享存储 (NFS 或云盘)

### 3.2 网络配置

```
公网 IP: 1.2.3.4
DNS: libai-system.com (A 记录 → 公网 IP)
SSL: Let's Encrypt (免费) 或 商业证书
防火墙:
  - 允许: 80 (HTTP), 443 (HTTPS), 3000 (API)
  - 拒绝: 其他所有
```

**安全组规则** (云服务器):
- 入方向: 80, 443, 3000, 22 (SSH 仅限白名单)
- 出方向: 全部

### 3.3 域名与 SSL

```bash
# 1. 购买域名 (推荐: Namecheap, GoDaddy)
# 2. 解析到服务器 IP
# 3. 申请 SSL 证书 (Let's Encrypt)
sudo certbot --nginx -d libai-system.com -d www.libai-system.com
# 自动续期: certbot renew
```

---

## 4. 部署流水线

### 4.1 CI/CD 流程

```
开发者 → Git push → GitHub Webhook → CI (测试/构建) → CD (部署)
```

**GitHub Actions 配置** (`.github/workflows/deploy.yml`):

```yaml
name: Deploy

on:
  push:
    branches: [main, release/*]

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - name: Install Node.js
        uses: actions/setup-node@v3
        with:
          node-version: 18
      - run: npm ci
      - run: npm test
      - run: npm run lint

  build:
    needs: test
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - name: Build Docker image
        run: |
          docker build -t libai-system:${{ github.sha }} .
          docker tag libai-system:${{ github.sha }} libai-system:latest
      - name: Push to registry
        run: |
          echo ${{ secrets.DOCKER_PASSWORD }} | docker login -u ${{ secrets.DOCKER_USERNAME }} --password-stdin
          docker push libai-system:${{ github.sha }}
          docker push libai-system:latest

  deploy:
    needs: build
    runs-on: ubuntu-latest
    steps:
      - name: Deploy to production
        run: |
          ssh root@libai-system.com "docker pull libai-system:${{ github.sha }} && docker stop libai-system && docker rm libai-system && docker run -d --name libai-system --env-file .env libai-system:${{ github.sha }}"
```

### 4.2 容器化

**Dockerfile** (已在前文给出)

**多阶段构建** 减小镜像体积:
- Stage 1: 安装依赖 + 构建
- Stage 2: 仅复制 dist 和 node_modules

**镜像大小目标**: < 500 MB

---

## 5. 监控体系建设

### 5.1 指标监控 (Prometheus + Grafana)

**Prometheus 配置** (`prometheus.yml`):

```yaml
global:
  scrape_interval: 15s

scrape_configs:
  - job_name: 'libai-system'
    static_configs:
      - targets: ['localhost:3000']

  - job_name: 'node'
    static_configs:
      - targets: ['localhost:9100']  # node_exporter

  - job_name: 'postgres'
    static_configs:
      - targets: ['localhost:9187']  # postgres_exporter

  - job_name: 'redis'
    static_configs:
      - targets: ['localhost:9121']  # redis_exporter

  - job_name: 'nginx'
    static_configs:
      - targets: ['localhost:9113']  # nginx-prometheus-exporter
```

**Grafana 仪表盘**:
- 系统概览 (CPU, Memory, Disk, Network)
- 应用性能 (延迟、吞吐、错误率)
- 业务指标 (用户数、订阅数、收入)
- Agent 状态 (数量、健康、负载)

### 5.2 日志聚合 (Loki)

**架构**: 应用 → Loki → Grafana

**Winston 集成**:
```javascript
const winston = require('winston');
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

**查询**: Grafana → Explore → Logs

### 5.3 链路追踪 (Jaeger)

**OpenTelemetry 集成**:

```javascript
const { NodeSDK } = require('@opentelemetry/sdk-node');
const { JaegerExporter } = require('@opentelemetry/exporter-jaeger');

const sdk = new NodeSDK({
  traceExporter: new JaegerExporter({
    endpoint: 'http://localhost:14268/api/traces'
  })
});
sdk.start();
```

**查看**: Jaeger UI (http://localhost:16686)

---

## 6. 安全体系建设

### 6.1 认证与授权

**JWT 流程**:
```
用户登录 → 验证凭证 → 生成 JWT (exp: 24h) → 返回客户端
客户端 → 每次请求带 Authorization: Bearer <token>
服务器 → 验证签名和过期 → 解析用户信息
```

**刷新令牌**:
- 访问令牌: 24h
- 刷新令牌: 7天，存储于 HttpOnly Cookie
- 刷新端点: `POST /auth/refresh`

**RBAC 角色**:
- `admin`: 所有权限
- `user`: 使用系统
- `support`: 查看用户数据 (不能修改)
- `auditor`: 只读审计日志

**权限中间件**:
```javascript
function requireRole(role) {
  return async (req, res, next) => {
    const user = req.user;
    if (!user.roles.includes(role)) {
      return res.status(403).json({ error: '权限不足' });
    }
    next();
  };
}

// 使用
app.get('/admin/stats', requireRole('admin'), (req, res) => { ... });
```

### 6.2 数据加密

**传输加密**: TLS 1.3 (HTTPS)

**存储加密**:
- 敏感字段 (API Key, 密码) → AES-256-GCM
- 数据库列级加密

```javascript
const crypto = require('crypto');
const algorithm = 'aes-256-gcm';
const key = crypto.scryptSync(process.env.ENCRYPTION_KEY, 'salt', 32);

function encrypt(text) {
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv(algorithm, key, iv);
  let encrypted = cipher.update(text, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  const authTag = cipher.getAuthTag();
  return iv.toString('hex') + ':' + encrypted + ':' + authTag.toString('hex');
}
```

### 6.3 审计日志

**记录所有关键操作**:

```javascript
const auditLog = async (actor, action, resource, before, after) => {
  await db.query(`
    INSERT INTO audit_logs (timestamp, actor, action, resource, before_state, after_state, ip)
    VALUES ($1, $2, $3, $4, $5, $6, $7)
  `, [Date.now(), actor, action, resource.id, JSON.stringify(before), JSON.stringify(after), req.ip]);
};
```

**审计日志不可删除**，只追加，保留 7 年。

---

## 7. 多租户实现

### 7.1 隔离策略

**推荐**: 共享数据库，独立 Schema (PostgreSQL)

```sql
-- 每个租户一个 schema
CREATE SCHEMA tenant_001;
SET search_path TO tenant_001, public;

-- 表创建在 tenant schema 中
CREATE TABLE users (...);
```

**应用层路由**:
```javascript
const tenantId = req.user.tenantId;
await db.query(`SET search_path TO tenant_${tenantId}, public`);
```

### 7.2 配额管理

**租户资源限制**:

| 资源 | 入门 | 专业 | 企业 |
|------|------|------|------|
| Agent 数 | 10 | 50 | 200 |
| API 请求/分钟 | 100 | 1000 | 10000 |
| 存储空间 | 1 GB | 10 GB | 100 GB |
| 并发会话 | 1 | 5 | 20 |

**检查配额**:
```javascript
async function checkQuota(tenantId, resource) {
  const usage = await getCurrentUsage(tenantId, resource);
  const limit = await getQuotaLimit(tenantId, resource);
  if (usage >= limit) {
    throw new Error(`配额超限: ${resource}`);
  }
}
```

---

## 8. 备份与恢复

### 8.1 备份策略

**全量备份**: 每日凌晨 2:00
**增量备份**: 每小时

**备份内容**:
- PostgreSQL 数据库 (pg_dump)
- Redis 数据 (RDB 或 AOF)
- 配置文件 (Git)
- 日志文件 (归档)

**存储**: 对象存储 (S3 兼容) 或 远程服务器

### 8.2 恢复流程

**步骤**:
1. 停止系统: `pm2 stop all`
2. 恢复数据库: `pg_restore -d libai_trading backup.dump`
3. 恢复 Redis: `redis-cli --pipe < dump.rdb`
4. 重启系统: `pm2 start all`
5. 验证数据完整性

**RTO (恢复时间目标)**: < 2 小时  
**RPO (恢复点目标)**: < 1 小时

---

## 9. 自动化运维

### 9.1 健康检查与自愈

**健康检查端点**:
- `/health` - 简单状态 (200 OK)
- `/ready` - 就绪检查 (依赖全部正常)
- `/live` - 存活检查 (进程 alive)

**自愈策略**:
```javascript
// 使用 PM2 自动重启
{
  "autorestart": true,
  "max_restarts": 10,
  "min_uptime": 10000,
  "restart_delay": 5000
}

// 自定义监控
setInterval(async () => {
  const health = await checkHealth();
  if (!health) {
    console.error('系统不健康，重启中...');
    process.exit(1); // PM2 会重启
  }
}, 30000);
```

### 9.2 扩缩容自动化

**基于指标的自动扩缩**:

```javascript
class AutoScaler {
  constructor() {
    this.targets = {
      trader: { min: 40, max: 200, current: 40 },
      risk_manager: { min: 20, max: 100, current: 20 }
    };
  }

  async evaluate() {
    const metrics = await collectMetrics();

    if (metrics.queueLength > 5000 && this.targets.trader.current < this.targets.trader.max) {
      await this.scaleUp('trader', 5);
    }
    if (metrics.cpuUsage < 30 && this.targets.trader.current > this.targets.trader.min) {
      await this.scaleDown('trader', 2);
    }
  }
}
```

**运行**: 每 5 分钟执行一次

---

## 10. 文档与培训

### 10.1 文档清单

| 文档 | 受众 | 格式 |
|------|------|------|
| 部署手册 | 运维 | PDF + Markdown |
| 运维手册 | 运维 | Markdown |
| API 文档 | 开发者 | OpenAPI (Swagger) |
| 故障排除指南 | 支持团队 | Markdown |
| 安全合规手册 | 安全团队 | PDF |
| 用户手册 | 终端用户 | PDF + 在线帮助 |

### 10.2 培训计划

**对象**: 运维团队、支持团队、开发团队

**内容**:
- 系统架构概览 (2h)
- 部署与升级 (2h)
- 监控与告警 (2h)
- 故障处理 (2h)
- 安全规范 (1h)

**考核**: 实操考试 + 理论测试

---

## 11. 验收标准

### 基础设施
- [ ] 服务器配置符合规格
- [ ] 域名解析正常
- [ ] SSL 证书有效
- [ ] 防火墙规则正确

### 部署流水线
- [ ] CI/CD 自动化
- [ ] 容器镜像构建成功
- [ ] 部署脚本可用

### 监控
- [ ] Prometheus 抓取指标正常
- [ ] Grafana 仪表盘配置完成
- [ ] 告警规则生效
- [ ] Loki 日志可查询
- [ ] Jaeger 链路追踪可用

### 安全
- [ ] HTTPS 强制
- [ ] JWT 认证工作正常
- [ ] RBAC 权限控制正确
- [ ] 审计日志完整
- [ ] 通过安全扫描 (无高危漏洞)

### 多租户
- [ ] 租户数据隔离测试通过
- [ ] 配额限制生效
- [ ] 自定义配置生效

### 运维
- [ ] 备份策略已配置并测试恢复
- [ ] 健康检查端点正常
- [ ] 自动重启机制有效
- [ ] 文档齐全

---

## 12. 时间计划

| 阶段 | 内容 | 工期 | 负责人 |
|------|------|------|--------|
| Phase 0 | 基础设施准备 | 1天 | 云端李白 |
| Phase 1 | 部署流水线搭建 | 2天 | 本地李白 |
| Phase 2 | 监控体系建设 | 2天 | 本地李白 |
| Phase 3 | 安全加固 | 2天 | C李白 |
| Phase 4 | 多租户实现 | 3天 | 本地李白 |
| Phase 5 | 备份与自动化 | 2天 | 云端李白 |
| Phase 6 | 文档与培训 | 2天 | C李白 |
| Phase 7 | 验收测试 | 1天 | 全体 |
| **总计** | | **15 天** | |

---

## 13. 风险与应对

| 风险 | 概率 | 影响 | 应对 |
|------|------|------|------|
| 云服务器延迟高 | 中 | 高 | 多区域部署，CDN |
| 第三方API故障 | 高 | 中 | 熔断降级，本地缓存 |
| 数据丢失 | 低 | 极高 | 多重备份，恢复演练 |
| 安全漏洞 | 中 | 高 | 定期扫描，WAF |
| 人员变动 | 低 | 中 | 文档齐全，交叉培训 |

---

**负责人**: 本地李白 (技术实施) + 云端李白 (基础设施)  
**审批**: C李白  
**参考**: `system-integration-v5.md`, `multi-agent-complete-v3.md`

---

**下一步**: 按本章计划逐项建设，每周汇报进度。完成后进入 `integration-optimization-v7.md` 最终优化阶段。
