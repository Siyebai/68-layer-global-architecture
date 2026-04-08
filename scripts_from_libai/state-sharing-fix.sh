#!/bin/bash
# 修复cluster模式下的状态共享问题
# 将状态指标写入Redis，使所有worker可访问

set -e

cd /root/.openclaw/workspace/libai-workspace

echo "=========================================="
echo "  状态共享修复 - Redis状态存储"
echo "=========================================="
echo ""

GREEN='\033[0;32m'
NC='\033[0m'

# 1. 创建状态同步模块
echo -e "${GREEN}[1] 创建Redis状态存储模块...${NC}"
cat > lib/redis-state-store.js << 'REDISSTATE'
// Redis状态存储 - 跨worker共享状态
class RedisStateStore {
  constructor(redis, prefix = 'system:state:') {
    this.redis = redis;
    this.prefix = prefix;
    this.localCache = new Map();
    this.updateInterval = 5000; // 5秒同步一次
  }

  async getMetrics() {
    try {
      const data = await this.redis.hgetall(`${this.prefix}metrics`);
      return {
        messagesProcessed: parseInt(data.messagesProcessed) || 0,
        errors: parseInt(data.errors) || 0,
        tradesExecuted: parseInt(data.tradesExecuted) || 0,
        profit: parseFloat(data.profit) || 0,
        learningCycles: parseInt(data.learningCycles) || 0,
        evolutionGenerations: parseInt(data.evolutionGenerations) || 0,
        iterationsCompleted: parseInt(data.iterationsCompleted) || 0,
        knowledgeBaseSize: parseInt(data.knowledgeBaseSize) || 0,
      };
    } catch (err) {
      console.error('RedisStateStore getMetrics error:', err.message);
      return this.getDefaultMetrics();
    }
  }

  async updateMetrics(metrics) {
    try {
      await this.redis.hmset(`${this.prefix}metrics`, {
        messagesProcessed: metrics.messagesProcessed || 0,
        errors: metrics.errors || 0,
        tradesExecuted: metrics.tradesExecuted || 0,
        profit: metrics.profit || 0,
        learningCycles: metrics.learningCycles || 0,
        evolutionGenerations: metrics.evolutionGenerations || 0,
        iterationsCompleted: metrics.iterationsCompleted || 0,
        knowledgeBaseSize: metrics.knowledgeBaseSize || 0,
        updatedAt: Date.now()
      });
    } catch (err) {
      console.error('RedisStateStore updateMetrics error:', err.message);
    }
  }

  async getEngines() {
    try {
      const data = await this.redis.hgetall(`${this.prefix}engines`);
      return {
        learning: parseInt(data.learning) || 0,
        evolution: parseInt(data.evolution) || 0,
        iteration: parseInt(data.iteration) || 0,
      };
    } catch (err) {
      console.error('RedisStateStore getEngines error:', err.message);
      return { learning: 0, evolution: 0, iteration: 0 };
    }
  }

  async updateEngines(engines) {
    try {
      await this.redis.hmset(`${this.prefix}engines`, {
        learning: engines.learning || 0,
        evolution: engines.evolution || 0,
        iteration: engines.iteration || 0,
        updatedAt: Date.now()
      });
    } catch (err) {
      console.error('RedisStateStore updateEngines error:', err.message);
    }
  }

  getDefaultMetrics() {
    return {
      messagesProcessed: 0,
      errors: 0,
      tradesExecuted: 0,
      profit: 0,
      learningCycles: 0,
      evolutionGenerations: 0,
      iterationsCompleted: 0,
      knowledgeBaseSize: 0,
    };
  }
}

module.exports = { RedisStateStore };
REDISSTATE

echo "✅ Redis状态存储模块已创建"
echo ""

# 2. 创建状态同步脚本
echo -e "${GREEN}[2] 创建状态同步脚本...${NC}"
cat > scripts/state-sync.js << 'SYNC'
#!/usr/bin/env node
// 状态同步器 - 定期将本地状态同步到Redis

const { RedisStateStore } = require('../lib/redis-state-store');

class StateSync {
  constructor(system, redis) {
    this.system = system;
    this.redis = redis;
    this.store = new RedisStateStore(redis);
    this.interval = 5000; // 5秒
    this.running = false;
  }

  start() {
    if (this.running) return;
    this.running = true;
    
    // 立即同步一次
    this.sync();
    
    // 定期同步
    setInterval(() => this.sync(), this.interval);
    console.log('[StateSync] 状态同步器已启动，间隔5秒');
  }

  async sync() {
    try {
      if (!this.system || !this.system.state || !this.system.learningEngine) {
        return;
      }

      // 收集指标
      const metrics = {
        messagesProcessed: this.system.state.metrics.messagesProcessed || 0,
        errors: this.system.state.metrics.errors || 0,
        tradesExecuted: this.system.state.metrics.tradesExecuted || 0,
        profit: this.system.state.metrics.profit || 0,
        learningCycles: this.system.state.metrics.learningCycles || 0,
        evolutionGenerations: this.system.evolutionEngine ? this.system.evolutionEngine.generation || 0 : 0,
        iterationsCompleted: this.system.state.metrics.iterationsCompleted || 0,
        knowledgeBaseSize: this.system.learningEngine && this.system.learningEngine.knowledgeBase ? this.system.learningEngine.knowledgeBase.size || 0 : 0,
      };

      // 收集引擎状态
      const engines = {
        learning: metrics.knowledgeBaseSize,
        evolution: metrics.evolutionGenerations,
        iteration: metrics.iterationsCompleted
      };

      // 写入Redis
      await this.store.updateMetrics(metrics);
      await this.store.updateEngines(engines);
    } catch (err) {
      console.error('[StateSync] 同步失败:', err.message);
    }
  }
}

module.exports = { StateSync };
SYNC

chmod +x scripts/state-sync.js
echo "✅ 状态同步脚本已创建"
echo ""

# 3. 修改主系统脚本以使用Redis状态
echo -e "${GREEN}[3] 应用状态共享补丁...${NC}"
cat > scripts/state-sharing-patch.js << 'PATCH'
// 状态共享补丁 - 修改TradingSystem类
// 在 initialize() 方法中添加状态同步器

// 在 initialize() 的末尾添加:
// this.stateSync = new StateSync(this, this.redis);
// this.stateSync.start();

// 修改 getStatus() 方法:
// 1. 添加 async 关键字
// 2. 在方法开始时调用 await this.stateSync.store.getMetrics() 和 getEngines()
// 3. 返回从Redis获取的数据而非本地state

console.log('状态共享补丁已加载 - 需要在主脚本中应用');
PATCH

echo "✅ 补丁已创建 (需要手动应用到主脚本)"
echo ""

# 4. 生成修复报告
echo -e "${GREEN}[4] 生成状态修复报告...${NC}"
REPORT="STATE-SHARING-FIX-$(date +%Y%m%d-%H%M).md"
cat > "$REPORT" << EOF
# 状态共享问题修复报告

## 问题描述
在cluster模式下，每个worker进程有独立的内存空间，导致:
- HTTP请求可能路由到不同worker
- 状态指标在worker间不共享
- /status接口返回null或过时数据

## 解决方案
使用Redis作为中央状态存储，所有worker共享同一状态源。

## 文件变更

### 新增
- `lib/redis-state-store.js` - Redis状态存储类
- `scripts/state-sync.js` - 状态同步器
- `scripts/state-sharing-patch.js` - 应用补丁说明

## 手动应用补丁

### 步骤1: 修改 TradingSystem.initialize()
在 `scripts/ultimate-v26-autonomous-learning.js` 的 initialize() 方法末尾添加:

\`\`\`javascript
// 在 startEngineTriggers() 调用之后添加
const { StateSync } = require('../scripts/state-sync');
this.stateSync = new StateSync(this, this.redis);
this.stateSync.start();
console.log('✅ 状态同步器已启动');
\`\`\`

### 步骤2: 修改 getStatus() 方法
将方法签名改为 async，并从Redis读取状态:

\`\`\`javascript
async getStatus() {
  const agentHealth = this.agents.map(a => a.getHealth());
  
  // 从Redis获取最新状态
  const metrics = await this.stateSync.store.getMetrics();
  const engines = await this.stateSync.store.getEngines();
  
  return {
    version: '26.0.0',
    intelligence_level: 22,
    agents_total: this.agents.length,
    teams: 80,
    cycle_time_ms: 80,
    uptime: Date.now() - this.startTime,
    agents: {
      total: this.agents.length,
      healthy: agentHealth.filter(a => a.state === 'running').length,
      details: agentHealth,
    },
    metrics: metrics,
    engines: engines,
    redis: this.redis ? 'connected' : 'disconnected',
  };
}
\`\`\`

### 步骤3: 重启系统
\`\`\`bash
pm2 restart libai-system
\`\`\`

### 步骤4: 验证
\`\`\`bash
curl http://localhost:3000/status | jq '.metrics, .engines'
\`\`\`

预期看到非null值，且数据每5秒更新。

---

生成时间: $(date)
EOF

echo "✅ 状态修复报告已生成: $REPORT"

# 5. 即时验证
echo ""
echo -e "${GREEN}📊 当前状态验证:${NC}"
curl -s http://localhost:3000/status | jq '.metrics, .engines' 2>/dev/null || echo "状态接口错误"
echo ""

echo -e "${GREEN}🔧 修复步骤总结:${NC}"
echo "1. 查看详细报告: cat $REPORT"
echo "2. 按照补丁说明修改主脚本"
echo "3. 重启系统"
echo "4. 验证状态接口返回有效数据"
echo ""
echo -e "${YELLOW}⚠️  当前系统处于部分运行状态，需要手动应用补丁${NC}"
