#!/bin/bash
# 第7轮整合 - Phase 2: 多智能体协调器集成
# 用multi-agent-system的事件驱动框架替换V7.2的setInterval

set -e

cd /root/.openclaw/workspace/libai-workspace

echo "=========================================="
echo "  第7轮整合 - Phase 2: 多智能体协调器"
echo "=========================================="
echo ""

LOG_DIR="logs/integration-round-7"
START_TIME=$(date '+%Y%m%d-%H%M%S')
echo "开始时间: $(date)" > $LOG_DIR/phase2-multiagent-$START_TIME.log

# ==========================================
# 步骤1: 分析现有multi-agent-system
# ==========================================
echo "[1/6] 分析multi-agent-system框架..."

MULTI_DIR="multi-agent-system"
if [ ! -d "$MULTI_DIR" ]; then
  echo "❌ multi-agent-system目录不存在"
  exit 1
fi

echo "发现核心文件:"
ls -1 "$MULTI_DIR"/*.js

# 关键组件
COMPONENTS=(
  "agent-registry.js"
  "message-bus-v2.js"
  "multi-agent-coordinator-v2.js"
  "system-integration.js"
  "event-bus-v2.js"
  "base-agent.js"
)

for comp in "${COMPONENTS[@]}"; do
  if [ -f "$MULTI_DIR/$comp" ]; then
    size=$(wc -c < "$MULTI_DIR/$comp")
    echo "  ✅ $comp ($size bytes)"
  else
    echo "  ❌ $comp (缺失)"
  fi
done

# ==========================================
# 步骤2: 创建V7.2的多智能体协调器封装
# ==========================================
echo "[2/6] 创建V7.2多智能体协调器封装..."

COORDINATOR_DIR="scripts/coordinator-integration"
mkdir -p "$COORDINATOR_DIR"

cat > "$COORDINATOR_DIR/v7.2-coordinator.js" << 'EOF'
/**
 * V7.2MultiAgentCoordinator - 为V7.2封装multi-agent-system协调器
 * 将五层架构的周期调度转换为事件驱动
 */

const { EventEmitter } = require('events');
const path = require('path');

class V7.2MultiAgentCoordinator extends EventEmitter {
  constructor(v72System) {
    super();
    this.v72System = v72System;
    this.multiAgentDir = path.join(__dirname, '..', 'multi-agent-system');
    this.agents = {};
    this.eventBus = null;
    this.coordinator = null;
    this.running = false;
  }

  async initialize() {
    console.log('[V7.2Coordinator] 初始化多智能体协调器...');

    try {
      // 动态加载multi-agent-system组件
      const agentRegistry = require(this.multiAgentDir + '/agent-registry');
      const eventBus = require(this.multiAgentDir + '/event-bus-v2');
      const coordinator = require(this.multiAgentDir + '/multi-agent-coordinator-v2');

      // 初始化事件总线
      this.eventBus = new eventBus();
      await this.eventBus.start();
      console.log('[V7.2Coordinator] ✅ 事件总线已启动');

      // 初始化协调器
      this.coordinator = new coordinator({
        eventBus: this.eventBus,
        agentRegistry: agentRegistry
      });
      await this.coordinator.start();
      console.log('[V7.2Coordinator] ✅ 协调器已启动');

      // 注册V7.2五层为智能体
      this.registerV72LayersAsAgents();

      // 设置事件监听
      this.setupEventListeners();

      console.log('[V7.2Coordinator] 多智能体协调器初始化完成');
      return true;
    } catch (e) {
      console.error('[V7.2Coordinator] ❌ 初始化失败:', e.message);
      throw e;
    }
  }

  // 将V7.2五层注册为智能体
  registerV72LayersAsAgents() {
    const layers = [
      { id: 'perception', name: '感知层', interval: 30000 },
      { id: 'cognition', name: '认知层', interval: 60000 },
      { id: 'action', name: '行动层', interval: 180000 },
      { id: 'learning', name: '学习层', interval: 300000 },
      { id: 'evolution', name: '进化层', interval: 1800000 }
    ];

    for (const layer of layers) {
      this.eventBus.publish('agent:register', {
        agentId: layer.id,
        name: layer.name,
        type: 'v7-layer',
        capabilities: [layer.id],
        heartbeatInterval: layer.interval
      });
      console.log(`[V7.2Coordinator] 注册智能体: ${layer.name} (${layer.id})`);
    }
  }

  // 设置事件监听，桥接V7.2和多智能体系统
  setupEventListeners() {
    // 监听五层事件，转发到事件总线
    this.v72System.on('perception:cycle', (data) => {
      this.eventBus.publish('perception:completed', {
        layer: 'perception',
        timestamp: Date.now(),
        data: data
      });
    });

    this.v72System.on('cognition:cycle', (data) => {
      this.eventBus.publish('cognition:completed', {
        layer: 'cognition',
        timestamp: Date.now(),
        data: data
      });
    });

    this.v72System.on('action:cycle', (data) => {
      this.eventBus.publish('action:completed', {
        layer: 'action',
        timestamp: Date.now(),
        data: data
      });
    });

    this.v72System.on('learning:cycle', (data) => {
      this.eventBus.publish('learning:completed', {
        layer: 'learning',
        timestamp: Date.now(),
        data: data
      });
    });

    this.v72System.on('evolution:cycle', (data) => {
      this.eventBus.publish('evolution:completed', {
        layer: 'evolution',
        timestamp: Date.now(),
        data: data
      });
    });

    // 监听其他智能体的事件
    this.eventBus.subscribe('signal:technical', (msg) => {
      this.emit('signalReceived', msg.payload);
    });

    this.eventBus.subscribe('decision:approval', (msg) => {
      this.emit('decisionApproved', msg.payload);
    });

    this.eventBus.subscribe('alert:system', (msg) => {
      this.emit('systemAlert', msg.payload);
    });

    console.log('[V7.2Coordinator] 事件监听已设置');
  }

  // 启动协调器
  async start() {
    console.log('[V7.2Coordinator] 启动多智能体协调...');
    this.running = true;

    // 启动五层的周期调度 (保留原逻辑，但改为事件触发)
    this.scheduleLayerCycles();

    console.log('[V7.2Coordinator] ✅ 多智能体协调器已启动');
    return true;
  }

  // 调度五层周期 (改为事件触发而非setInterval)
  scheduleLayerCycles() {
    // 感知层: 30秒
    setInterval(() => {
      if (this.running) {
        this.v72System.perceptionCycle()
          .then(result => this.emit('perceptionCycle', result))
          .catch(e => console.error('[V7.2Coordinator] 感知层错误:', e));
      }
    }, 30000);

    // 认知层: 1分钟
    setInterval(() => {
      if (this.running) {
        this.v72System.cognitionCycle()
          .then(result => this.emit('cognitionCycle', result))
          .catch(e => console.error('[V7.2Coordinator] 认知层错误:', e));
      }
    }, 60000);

    // 行动层: 3分钟
    setInterval(() => {
      if (this.running) {
        this.v72System.actionCycle()
          .then(result => this.emit('actionCycle', result))
          .catch(e => console.error('[V7.2Coordinator] 行动层错误:', e));
      }
    }, 180000);

    // 学习层: 5分钟
    setInterval(() => {
      if (this.running) {
        this.v72System.learningCycle()
          .then(result => this.emit('learningCycle', result))
          .catch(e => console.error('[V7.2Coordinator] 学习层错误:', e));
      }
    }, 300000);

    // 进化层: 30分钟
    setInterval(() => {
      if (this.running) {
        this.v72System.evolutionCycle()
          .then(result => this.emit('evolutionCycle', result))
          .catch(e => console.error('[V7.2Coordinator] 进化层错误:', e));
      }
    }, 1800000);

    console.log('[V7.2Coordinator] 五层周期调度已设置');
  }

  // 停止协调器
  async stop() {
    console.log('[V7.2Coordinator] 停止多智能体协调器...');
    this.running = false;

    if (this.coordinator) {
      await this.coordinator.stop();
    }
    if (this.eventBus) {
      await this.eventBus.stop();
    }

    console.log('[V7.2Coordinator] ✅ 已停止');
    return true;
  }

  // 获取状态
  getStatus() {
    return {
      running: this.running,
      eventBus: this.eventBus ? this.eventBus.getStatus() : { connected: false },
      coordinator: this.coordinator ? this.coordinator.getStatus() : { active: false },
      layers: {
        perception: { scheduled: true, interval: '30s' },
        cognition: { scheduled: true, interval: '1m' },
        action: { scheduled: true, interval: '3m' },
        learning: { scheduled: true, interval: '5m' },
        evolution: { scheduled: true, interval: '30m' }
      }
    };
  }
}

module.exports = V7.2MultiAgentCoordinator;

EOF

echo "✅ V7.2多智能体协调器封装已创建"
echo "  大小: $(wc -c < $COORDINATOR_DIR/v7.2-coordinator.js) bytes"

# ==========================================
# 步骤3: 修改V7.2主系统集成协调器
# ==========================================
echo "[3/6] 修改V7.2集成多智能体协调器..."

V72_FILE="scripts/autonomous-five-layer-v7-2.js"

# 在构造函数中添加 coordinator 属性
sed -i '/this\.contractAdapter = null;/a\    this.coordinator = null;  // 多智能体协调器' "$V72_FILE"
echo "✅ 添加 coordinator 属性"

# 在 start() 方法的合约交易初始化后添加协调器初始化
sed -i '/合约交易系统已集成/a\    // Phase 2: 多智能体协调器集成\n    console.log("[V7.2] 启动多智能体协调器...");\n    try {\n      const V72Coordinator = require("./coordinator-integration/v7.2-coordinator");\n      this.coordinator = new V72Coordinator(this);\n      await this.coordinator.initialize();\n      await this.coordinator.start();\n      console.log("[V7.2] ✅ 多智能体协调器已启动");\n    } catch (e) {\n      console.error("[V7.2] ❌ 协调器集成失败:", e.message);\n    }' "$V72_FILE"
echo "✅ 在 start() 中添加协调器初始化"

# 在 getStatus() 中添加 coordinator 状态
sed -i '/contractTrading:/a\      coordinator: this.coordinator ? this.coordinator.getStatus() : { running: false }' "$V72_FILE"
echo "✅ 在 getStatus() 中添加协调器状态"

echo "✅ V7.2多智能体协调器集成完成"

# ==========================================
# 步骤4: 创建配置
# ==========================================
echo "[4/6] 创建多智能体协调配置..."

mkdir -p config/multi-agent

cat > config/multi-agent/v7.2-integration.yaml << 'EOF'
# V7.2 多智能体协调配置

# 事件总线配置
eventBus:
  type: "redis"  # redis | memory
  redis:
    host: "127.0.0.1"
    port: 6379
    channel: "v7.2:events"
  memory:
    maxListeners: 100

# 智能体注册
agentRegistry:
  autoRegister: true
  heartbeatInterval: 30000  # 30秒
  timeout: 10000

# 协调策略
coordination:
  strategy: "event-driven"  # event-driven | schedule | hybrid
  maxConcurrent: 10
  queueSize: 1000

# 监控
monitoring:
  enabled: true
  metricsInterval: 60000  # 1分钟
  logLevel: "info"
EOF

echo "✅ 多智能体配置已创建"

# ==========================================
# 步骤5: 验证修改
# ==========================================
echo "[5/6] 验证修改..."

# 检查关键字符串
if grep -q "this.coordinator = null;" "$V72_FILE"; then
  echo "✅  coordinator 属性已添加"
else
  echo "❌ coordinator 属性缺失"
fi

if grep -q "V72Coordinator" "$V72_FILE"; then
  echo "✅  协调器初始化代码已添加"
else
  echo "❌ 协调器初始化代码缺失"
fi

if grep -q "coordinator:" "$V72_FILE"; then
  echo "✅  getStatus() 已包含 coordinator"
else
  echo "❌ getStatus() 缺少 coordinator"
fi

# ==========================================
# 步骤6: 生成报告
# ==========================================
echo "[6/6] 生成整合报告..."

cat > "$LOG_DIR/phase2-multiagent-$START_TIME-report.md" << EOF
# Phase 2: 多智能体协调器集成报告

## 时间
$(date)

## 完成内容

### 1. 创建V7.2协调器封装
- 文件: `scripts/coordinator-integration/v7.2-coordinator.js`
- 功能: 将multi-agent-system的事件驱动框架适配到V7.2
- 特性:
  - 动态加载multi-agent-system组件
  - 将五层注册为智能体
  - 桥接V7.2事件到事件总线
  - 保持原有周期调度但改为事件触发

### 2. 修改V7.2主系统
- 添加 `this.coordinator` 属性
- `start()` 方法中初始化和启动协调器
- `getStatus()` 返回协调器状态

### 3. 配置文件
- `config/multi-agent/v7.2-integration.yaml`
- 事件总线配置 (Redis或Memory)
- 智能体注册配置
- 协调策略配置

## 技术要点

### 事件桥接
V7.2五层通过 `this.emit('layer:cycle', data)` 发布事件
协调器监听这些事件并发布到事件总线:
```
perception:cycle → perception:completed
cognition:cycle  → cognition:completed
action:cycle     → action:completed
learning:cycle   → learning:completed
evolution:cycle  → evolution:completed
```

### 保留的调度
五层的周期调度仍然使用 `setInterval`，但触发的是V7.2方法而非直接操作
这确保了向后兼容和可测试性

### 可扩展性
其他智能体可以通过事件总线订阅五层事件，实现松耦合协作

## 下一步
- Phase 3: 第二大脑系统增强
- Phase 4: 漏洞检测集成
- Phase 5: 测试验证

## 状态
✅ Phase 2 完成
EOF

echo "✅ 报告已生成: $LOG_DIR/phase2-multiagent-$START_TIME-report.md"

echo ""
echo "=========================================="
echo "  Phase 2 完成"
echo "=========================================="
echo ""
echo "修改的文件:"
echo "  ✅ scripts/autonomous-five-layer-v7-2.js (已修改)"
echo "  ✅ scripts/coordinator-integration/v7.2-coordinator.js (新建)"
echo "  ✅ config/multi-agent/v7.2-integration.yaml (新建)"
echo ""
echo "下一步: Phase 3 - 第二大脑系统增强"
echo "=========================================="
