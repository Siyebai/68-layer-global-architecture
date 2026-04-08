# 📚 OpenClaw系统性学习资料汇编

**整理日期**: 2026-04-01  
**整理者**: 白居易 (bai-juyi)  
**版本**: 1.0  

---

## 📖 **资料汇总**

### 1. 《OpenClaw实战手册》（阿里云开发者社区）

**来源**: https://developer.aliyun.com/article/1712387  
**特点**: 零基础新手友好，强调安全第一，手把手部署+技能开发  
**核心内容**:

#### 🚀 **部署流程（6步）**

| 步骤 | 操作 | 命令/配置 |
|------|------|-----------|
| 1️⃣ 创建实例 | 阿里云轻量服务器，选OpenClaw专属镜像 | 2vCPU+2GiB+40GiB |
| 2️⃣ 放行端口 | 18789 (主), 22 (SSH) | `firewall-cmd --add-port=18789/tcp --permanent` |
| 3️⃣ 配置凭证 | 阿里云百炼API-Key | `openclaw config set models.providers.bailian.*` |
| 4️⃣ 启动服务 | systemctl + 开机自启 | `systemctl start openclaw && systemctl enable openclaw` |
| 5️⃣ 验证部署 | 版本检查 + 健康接口 + 浏览器 | `openclaw version`, `curl http://localhost:18789/api/v1/health` |
| 6️⃣ 配置加速源 | ClawHub阿里云镜像 | `openclaw config set clawhub.mirror "https://mirror.aliyun.com/clawhub/"` |

#### 🔧 **必装10大技能**

| 分类 | 技能名 | 功能 | 安装命令 |
|------|--------|------|----------|
| 基础必备 | agent-browser | 浏览器自动化 | (默认集成) |
| 基础必备 | todo-tracker | 待办管理 | `npx clawhub@latest install todo-tracker` |
| 基础必备 | remind-me | 定时提醒 | `npx clawhub@latest install remind-me` |
| 办公自动化 | email | 多平台邮件 | `npx clawhub@latest install email` |
| 办公自动化 | gog | Google生态 | `npx clawhub@latest install gog` |
| 办公自动化 | humanizer | 去AI痕迹 | `npx clawhub@latest install humanizer` |
| 内容创作 | gongzhonghao-yunying | 公众号运营 | `npx clawhub@latest install gongzhonghao-yunying` |
| 开发工具 | git-workflows | Git高级操作 | `npx clawhub@latest install git-workflows` |
| 数据分析 | GA4 | 网站分析 | `npx clawhub@latest install GA4` |
| 社交运营 | bird | X/Twitter自动化 | `npx clawhub@latest install bird` |

#### 🛠️ **自定义技能开发（天气查询示例）**

**核心原理**: SKILL.md + 脚本文件  
**步骤**:

1. 创建目录: `~/.openclaw/workspace/skills/weather-query`
2. 编写 SKILL.md（包含元数据、参数、示例）
3. 实现Python脚本（中国天气网API，无需密钥）
4. 安装依赖: `pip3 install requests`
5. 重启服务: `systemctl restart openclaw`
6. 测试: "查询北京的实时天气"

**避坑点**:
- 依赖需提前安装
- 参数名必须一致
- 用 `openclaw logs --skill <name>` 查错

#### ❌ **常见问题排查**

| 问题 | 原因 | 解决方案 |
|------|------|----------|
| 服务启动失败 | 端口占用/API-Key错误/内存不足 | `lsof -i :18789`, `openclaw models test`, `free -h` |
| 技能无响应 | 未激活/加速源错误/网络受限 | `openclaw skills enable`, 检查 `clawhub.mirror` |
| 模型调用失败 | 配额耗尽/凭证错误/无权限 | 百炼控制台检查额度, 重新配置 |
| 海外技能安装超时 | 未配置加速源/网络不通 | 配置阿里云镜像源 |
| 自定义技能报错 | 依赖缺失/版本不兼容 | `pip3 install`, `--upgrade` |

---

### 2. 《OpenClaw配置文件实战手册》（CSDN）

**来源**: https://m.blog.csdn.net/haolove527/article/details/158468286  
**特点**: 聚焦配置参数优化，省Token技巧，安全配置  
**核心内容**:

#### 📋 **配置文件结构** (`~/.openclaw/openclaw.json`)

```json5
{
  // 🔥 最核心：控制Agent行为 (90%优化在这里)
  agents: {
    defaults: { ... },  // 全局默认
    list: [ ... ]       // 多Agent单独配置
  },

  // 🤖 模型相关
  models: {
    providers: { ... }
  },

  // 📱 聊天渠道安全
  channels: { ... },

  // ⚙️ 其他辅助
  gateway: { ... },
  session: { ... },
  cache: { ... },
  tools: { ... }
}
```

#### ⚡ **省Token三大核心参数**（必须调）

| 参数路径 | 类型 | 默认 | 推荐值 | 说明 |
|----------|------|------|--------|------|
| `agents.defaults.models.moonshot/kimi-k2.5.params.temperature` | number | 1.0 | **0.2** | 低温度减少瞎编，显著省Token |
| `agents.defaults.compaction.reserveTokensFloor` | number | 24000 | **20000** | 超过此值自动压缩上下文 |
| `agents.defaults.heartbeat.every` | string | "30m" | **"30m"** | 空闲30分钟自动重置会话 |

#### 🛡️ **安全配置（必做！）**

```json5
{
  channels: {
    whatsapp: {
      // 只允许自己手机号
      allowFrom: ["+85212345678"]  // 香港+852，大陆+86
    }
  },
  tools: {
    allow: ["file.read", "browser.navigate"]  // 工具白名单，防止乱删文件
  }
}
```

#### 🔄 **配置生效流程**

1. 编辑 `~/.openclaw/openclaw.json` (建议VS Code + JSON5插件)
2. 大部分参数热重载，无需重启
3. 核心参数（如 `gateway.port`）需重启:
   ```bash
   # 本地
   openclaw gateway restart
   # 服务器
   systemctl restart openclaw
   ```
4. 验证:
   ```bash
   /status  # 查看temperature, heartbeat
   /usage   # 查看Token消耗
   ```

#### 📝 **推荐完整配置模板**

```json5
{
  agents: {
    defaults: {
      workspace: "~/.openclaw/workspace",
      model: { primary: "moonshot/kimi-k2.5" },
      models: {
        "moonshot/kimi-k2.5": {
          alias: "Kimi K2.5 (官方)",
          params: { temperature: 0.2 }
        }
      },
      compaction: {
        reserveTokensFloor: 20000,
        memoryFlush: {
          enabled: true,
          softThresholdTokens: 4000,
          systemPrompt: "Session nearing compaction. Store durable memories now.",
          prompt: "Write any lasting notes to memory/YYYY-MM-DD.md; reply with NO_REPLY if nothing to store."
        }
      },
      heartbeat: { every: "30m" }
    }
  },
  models: {
    providers: {
      moonshot: {
        type: "moonshot",
        apiKey: "YOUR_API_KEY",
        baseUrl: "https://api.moonshot.ai/v1",  // 香港用.ai，大陆换.cn
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
    whatsapp: { allowFrom: ["你的手机号"] }
  },
  session: { reset: { dailyTime: "04:00" } },
  cache: { ttl: "1h" }
}
```

---

### 3. 《OpenClaw从入门到精通》（CSDN）

**来源**: https://developer.aliyun.com/article/1712435  
**特点**: 命令大全，覆盖7大类核心操作  
**核心内容**:

#### 🎯 **7大类核心命令**

| 类别 | 命令示例 | 说明 |
|------|----------|------|
| 基础操作 | `openclaw status`, `openclaw start`, `openclaw stop` | 服务管理 |
| 诊断排错 | `openclaw doctor --fix`, `openclaw logs`, `journalctl -u openclaw -n 100` | 健康检查与日志 |
| 模型管理 | `openclaw models list`, `openclaw models test`, `openclaw models auth setup-token` | 模型配置 |
| 网关通道 | `openclaw channels add feishu`, `openclaw channels list` | 聊天渠道 |
| 插件技能 | `openclaw skills install`, `openclaw skills list`, `openclaw skills enable` | 技能管理 |
| 浏览器自动化 | `openclaw browse <url>`, `openclaw screenshot` | 网页操作 |
| 配置文件 | `openclaw config set <key> <value>`, `openclaw config get <key>` | 配置修改 |

#### 📂 **关键文件路径**

```
~/.openclaw/
├── openclaw.json           # 主配置（JSON5格式）
├── workspace/              # Agent工作目录
│   ├── memory/             # 记忆文件
│   ├── skills/             # 自定义技能
│   └── logs/               # 日志
├── logs/                   # 系统日志
│   ├── gateway.log
│   └── agent.log
└── cache/                  # 缓存目录
```

#### 🔐 **安全模式**

```bash
# 沙箱模式（推荐）- 限制文件访问
openclaw config set sandbox.mode "non-main"

# 完全权限（谨慎）
openclaw config set sandbox.mode "full-access"
```

---

### 4. 《OpenClaw 100个实战案例》（CSDN）

**来源**: https://m.blog.csdn.net/musicml/article/details/158343177  
**特点**: 真实场景应用，激发扩展思路  
**核心场景分类**:

| 场景 | 案例数 | 典型应用 |
|------|--------|----------|
| 开发者工作流 | 20+ | PR审查、代码生成、错误自动修复 |
| 运维DevOps | 15+ | 自动监控、CI/CD、日志分析 |
| 邮件与日历 | 12+ | 收件箱清零、日程安排、CRM集成 |
| 智能家居IoT | 10+ | Home Assistant控制、语音克隆 |
| 内容创作 | 18+ | 公众号运营、多平台发布、SEO优化 |
| 数据分析 | 8+ | GA4报表、股票分析、市场监控 |
| 商业自动化 | 17+ | 客服系统、订单处理、库存管理 |

**关键启示**:
- OpenClaw不仅是聊天机器人，更是**能执行复杂工作流的AI助手**
- 通过组合多个Skills，可实现端到端自动化
- 订阅制服务 + 技能市场 = 可持续商业模式

---

### 5. 《零基础养出"聪明龙虾"》（CSDN）

**来源**: https://m.blog.csdn.net/2301_81108348/article/details/158845566  
**特点**: 2026.4最新版，9个核心Skills安装指南  
**核心内容**:

#### 🎯 **9个必装核心Skills（按优先级）**

1. **file-manager** - 文件管理（读写、移动、删除）
2. **web-automation** - 浏览器自动化（基于Playwright）
3. **text-processor** - 文本处理（Markdown、格式化）
4. **search** - 实时搜索（Brave Search API）
5. **email-manager** - 邮件管理
6. **calendar** - 日历集成
7. **git** - Git操作自动化
8. **database** - 数据库查询
9. **monitor** - 系统监控

**安装命令**:
```bash
npx clawhub@latest install file-manager
npx clawhub@latest install web-automation
# ... 其他
```

---

## 📂 **资料存储位置**

### ✅ **本地Git仓库** (`/root/.openclaw/workspace/libai-workspace/knowledge/openclaw-learning-materials/`)

```
knowledge/openclaw-learning-materials/
├── 01-实战手册-阿里云部署.md
├── 02-配置手册-省Token技巧.md
├── 03-命令大全-7大类别.md
├── 04-100个实战案例.md
├── 05-9大核心Skills.md
├── 06-学习总结.md
└── README.md (本文件)
```

---

## 🎯 **下一步学习计划**

### 📅 **第一阶段：快速通读（1-2小时）**

1. 阅读《实战手册》部署章节（30min）
2. 阅读《配置手册》核心参数（20min）
3. 阅读《命令大全》基础操作（20min）
4. 浏览《100案例》激发思路（30min）

### 📅 **第二阶段：动手实践（3-4小时）**

1. **环境准备**:
   - 确认Node.js ≥22, Python3.9+已安装
   - 获取API Key（Kimi/阿里云百炼）
   
2. **部署验证**:
   - 执行健康检查: `openclaw doctor --fix`
   - 查看当前配置: `openclaw config get all`
   - 测试模型连接: `openclaw models test`

3. **技能安装**:
   ```bash
   npx clawhub@latest install file-manager
   npx clawhub@latest install web-automation
   npx clawhub@latest install search
   ```

4. **配置优化**:
   - 调整 temperature=0.2
   - 设置 heartbeat="30m"
   - 配置 channels.whatsapp.allowFrom

### 📅 **第三阶段：深度应用（持续）**

1. **开发1个自定义技能**: 参考天气查询示例，开发符合自己需求的技能
2. **实现1个自动化流程**: 组合多个Skills，完成端到端任务
3. **性能优化**: 监控Token消耗，调整compaction参数
4. **安全加固**: 定期审查logs，更新API密钥

---

## 📊 **学习进度跟踪**

| 阶段 | 完成时间 | 验证方式 | 备注 |
|------|----------|----------|------|
| 资料收集 | 2026-04-01 14:10 | ✅ 5份资料已下载 | 包含实战手册、配置手册、命令大全等 |
| 资料整理 | 2026-04-01 14:15 | ✅ 本README已完成 | 已生成6个章节的汇编文档 |
| 上传GitHub | 进行中 | ⏳ 待执行 | 保存到 `knowledge/openclaw-learning-materials/` |
| 上传腾讯微云 | 待定 | ⏳ 待执行 | 需要手动或脚本同步 |
| 开始学习 | 立即 | ⏳ 待开始 | 按三阶段计划执行 |

---

## 🔗 **相关资源**

- **OpenClaw官网**: https://openclaw.ai
- **ClawHub技能市场**: https://clawhub.com
- **阿里云OpenClaw专题**: https://www.aliyun.com/activity/ecs/clawdbot
- **GitHub仓库**: https://github.com/openclaw/openclaw
- **社区文档**: https://docs.openclaw.ai

---

**文档版本**: 1.0  
**最后更新**: 2026-04-01 14:15 GMT+8  
**维护者**: 白居易 (bai-juyi)  
**状态**: ✅ **资料收集完成，准备上传与学习**
