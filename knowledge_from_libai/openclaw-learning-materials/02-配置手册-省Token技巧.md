# OpenClaw配置实战手册 - 省Token与安全配置

**来源**: CSDN博客  
**原文**: https://m.blog.csdn.net/haolove527/article/details/158468286  
**整理日期**: 2026-04-01  
**整理者**: 白居易  

---

## 一、配置文件结构

### 文件位置
```
~/.openclaw/openclaw.json
```

### 格式
- **JSON5** - 支持注释、尾逗号、单引号
- 推荐: VS Code + JSON5插件编辑

### 核心结构

```json5
{
  // 🔥 Agent行为控制 (90%的优化在这里)
  agents: {
    defaults: { ... },     // 全局默认配置
    list: [ ... ]          // 多Agent单独配置
  },

  // 🤖 模型提供商配置
  models: {
    providers: { ... }
  },

  // 📱 聊天渠道安全配置
  channels: { ... },

  // ⚙️ 辅助配置
  gateway: { ... },
  session: { ... },
  cache: { ... },
  tools: { ... }
}
```

---

## 二、省Token三大核心参数（必须调整）

| 参数路径 | 类型 | 默认值 | **推荐值** | 说明 |
|----------|------|--------|-----------|------|
| `agents.defaults.models.moonshot/kimi-k2.5.params.temperature` | number | 1.0 | **0.2** | 低温度大幅减少瞎编，显著省Token |
| `agents.defaults.compaction.reserveTokensFloor` | number | 24000 | **20000** | 超过此Token数自动压缩历史上下文 |
| `agents.defaults.heartbeat.every` | string | "30m" | **"30m"** | 空闲30分钟自动开新会话，必开！ |

### 为什么这三个参数最重要？

1. **temperature=0.2** - 降低模型随机性，输出更稳定，减少重试次数
2. **reserveTokensFloor=20000** - 提前压缩，避免达到上下文窗口限制
3. **heartbeat="30m"** - 定期重置会话，防止上下文无限增长

---

## 三、完整配置模板（直接复制）

```json5
{
  agents: {
    defaults: {
      workspace: "~/.openclaw/workspace",
      model: { primary: "moonshot/kimi-k2.5" },
      models: {
        "moonshot/kimi-k2.5": {
          alias: "Kimi K2.5 (官方)",
          params: { temperature: 0.2 }  // 👈 核心：低温度
        }
      },
      compaction: {
        reserveTokensFloor: 20000,  // 👈 核心：压缩阈值
        memoryFlush: {
          enabled: true,
          softThresholdTokens: 4000,  // 软阈值：提前保存记忆
          systemPrompt: "Session nearing compaction. Store durable memories now.",
          prompt: "Write any lasting notes to memory/YYYY-MM-DD.md; reply with NO_REPLY if nothing to store."
        }
      },
      heartbeat: { every: "30m" }  // 👈 核心：空闲重置
    }
  },

  models: {
    providers: {
      moonshot: {
        type: "moonshot",
        apiKey: "YOUR_API_KEY",  // 👉 替换
        baseUrl: "https://api.moonshot.ai/v1",  // 香港用.ai，大陆用.cn
        api: "openai-completions",
        models: [{
          id: "kimi-k2.5",
          name: "Kimi K2.5",
          contextWindow: 256000,
          maxTokens: 8192,
          cost: { input: 0.1, output: 0.5 }
        }]
      }
    }
  },

  channels: {
    whatsapp: {
      allowFrom: ["+85212345678"]  // 👉 替换为你的手机号（必须！）
    }
  },

  session: { reset: { dailyTime: "04:00" } },
  cache: { ttl: "1h" },

  // 安全加固（可选但强烈推荐）
  tools: {
    allow: ["file.read", "browser.navigate", "search.perform"]  // 白名单
  },

  sandbox: { mode: "non-main" }  // 沙箱模式（推荐）
}
```

---

## 四、安全配置（必做！）

### 1. 渠道访问控制

**问题**: 不配置任何人都能通过WhatsApp调用你的Agent，花你的钱！

**配置**:
```json5
channels.whatsapp.allowFrom: ["+85212345678"]  // 你的手机号
```

**手机号格式**:
- 香港: `+85212345678`
- 大陆: `+8613901234567`
- 国际: `+国家码完整号码`

### 2. 工具白名单

**防止Agent乱删文件**:
```json5
tools.allow: [
  "file.read",
  "file.write",
  "browser.navigate",
  "search.perform"
  // 不包含 "file.delete" 等危险操作
]
```

### 3. 沙箱模式

```json5
sandbox.mode: "non-main"  // 限制文件访问（推荐）
# 或 "full-access"（完全权限，谨慎使用）
```

---

## 五、配置生效流程

### 步骤1: 编辑配置

```bash
# 用VS Code打开（支持JSON5高亮）
code ~/.openclaw/openclaw.json
```

### 步骤2: 检查语法

```bash
openclaw doctor --fix  # 自动检查并修复
```

### 步骤3: 应用配置

- **大部分参数**: 热重载，无需重启
- **核心参数** (gateway.port等): 需重启

```bash
# 本地运行
openclaw gateway restart

# 服务器运行
systemctl restart openclaw
```

### 步骤4: 验证

```bash
/status   # 查看temperature, heartbeat等
/usage    # 查看Token消耗，确认模型
```

---

## 六、模型提供商配置详解

### Kimi 2.5配置示例

```json5
models.providers.moonshot: {
  type: "moonshot",
  apiKey: "YOUR_API_KEY",
  baseUrl: "https://api.moonshot.ai/v1",  // 香港/海外用 .ai
  // baseUrl: "https://api.moonshot.cn/v1",  // 大陆用 .cn
  api: "openai-completions",
  models: [{
    id: "kimi-k2.5",
    name: "Kimi K2.5",
    contextWindow: 256000,
    maxTokens: 8192,
    cost: { input: 0.1, output: 0.5 }  // 元/1K tokens
  }]
}
```

### 地域与域名对应

| 服务器地域 | baseUrl | 说明 |
|-----------|---------|------|
| 香港/新加坡/海外 | `https://api.moonshot.ai/v1` | 用.ai域名 |
| 大陆内地 | `https://api.moonshot.cn/v1` | 用.cn域名，需要备案 |

---

## 七、其他常用配置

### 缓存优化

```json5
cache: {
  ttl: "1h"  // 缓存1小时，重复查询省Token
}
```

### 会话重置

```json5
session: {
  reset: {
    dailyTime: "04:00"  // 每天凌晨4点强制重置
  }
}
```

### 端口配置（需重启）

```json5
gateway: {
  port: 18789  // 默认端口，一般不改
}
```

---

## 八、配置检查清单

部署完成后，逐项检查:

- [ ] temperature 已设为 0.2
- [ ] reserveTokensFloor 已设为 20000
- [ ] heartbeat.every 已设为 "30m"
- [ ] channels.whatsapp.allowFrom 已配置为自己的手机号
- [ ] tools.allow 已设置白名单
- [ ] sandbox.mode 设为 "non-main"
- [ ] models.providers 的 API Key 正确
- [ ] baseUrl 与服务器地域匹配
- [ ] 执行 `openclaw doctor --fix` 无错误
- [ ] 执行 `/status` 查看关键参数已生效

---

## 九、Token消耗监控

### 查看统计

```bash
/usage  # 在聊天窗口发送
```

### 监控要点

| 指标 | 正常范围 | 异常信号 |
|------|----------|----------|
| 日均Token消耗 | <100K | 突然飙升→检查heartbeat |
| 单次对话Token | <20K | 超30K→调低temperature |
| 压缩次数 | 0-5次/天 | 频繁压缩→调低reserveTokensFloor |

---

## 十、常见配置错误

### 错误1: temperature 留空或 1.0

**后果**: 模型输出不稳定，重试多，Token消耗翻倍

**解决**: 设为 0.2

### 错误2: 未配置 allowFrom

**后果**: 别人乱用你的Agent，产生高额费用

**解决**: 立即配置渠道白名单

### 错误3: heartbeat 设为 "0m"

**后果**: 会话永不重置，上下文无限增长

**解决**: 改为 "30m"

### 错误4: 大陆服务器用 .ai 域名

**后果**: API调用失败或延迟高

**解决**: 换成 .cn 域名

---

**文档结束**
