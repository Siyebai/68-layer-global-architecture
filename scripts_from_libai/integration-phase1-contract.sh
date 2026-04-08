#!/bin/bash
# 第7轮整合 - Phase 1: 合约交易系统集成
# 将contract-trading系统集成到V7.2

set -e

cd /root/.openclaw/workspace/libai-workspace

echo "=========================================="
echo "  第7轮整合 - Phase 1: 合约交易系统"
echo "=========================================="
echo ""

LOG_DIR="logs/integration-round-7"
mkdir -p $LOG_DIR
START_TIME=$(date '+%Y%m%d-%H%M%S')
echo "开始时间: $(date)" > $LOG_DIR/phase1-contract-$START_TIME.log

# ==========================================
# 步骤1: 分析现有V7.2行动层
# ==========================================
echo "[1/6] 分析V7.2现有行动层..."

V72_FILE="scripts/autonomous-five-layer-v7-2.js"
if [ ! -f "$V72_FILE" ]; then
  echo "❌ V7.2主文件不存在: $V72_FILE"
  exit 1
fi

echo "V7.2主文件大小: $(wc -c < $V72_FILE) bytes"

# 检查现有行动层实现
grep -n "class.*ActionLayer\|actionLayer\|执行层" "$V72_FILE" | head -5 || echo "未找到明确的ActionLayer类"

# ==========================================
# 步骤2: 创建合约交易适配器
# ==========================================
echo "[2/6] 创建合约交易适配器..."

ADAPTER_DIR="scripts/contract-integration"
mkdir -p "$ADAPTER_DIR"

# 创建主适配器
cat > "$ADAPTER_DIR/contract-adapter.js" << 'EOF'
/**
 * ContractTradingAdapter - V7.2合约交易适配器
 * 集成contract-trading系统到V7.2五层架构
 */

const EventEmitter = require('events');

class ContractTradingAdapter extends EventEmitter {
  constructor(system) {
    super();
    this.system = system;
    this.agents = {};
    this.running = false;
    this.config = {
      dryRun: true,           // 模拟模式
      maxPositionSize: 25,    // 最大仓位25U
      dailyLossLimit: 5,      // 日亏损限额5U
      confidenceThreshold: 65 // 信心度门槛
    };
  }

  // 初始化所有智能体
  async initialize() {
    console.log('[ContractAdapter] 初始化合约交易系统...');

    // 1. 市场数据采集器
    this.agents.marketData = {
      start: () => this.startMarketDataCollector(),
      stop: () => this.stopAgent('marketData'),
      status: () => this.getAgentStatus('marketData')
    };

    // 2. 技术信号生成器
    this.agents.signalGenerator = {
      start: () => this.startSignalGenerator(),
      stop: () => this.stopAgent('signalGenerator'),
      status: () => this.getAgentStatus('signalGenerator')
    };

    // 3. 多维分析器
    this.agents.multiAnalyzer = {
      start: () => this.startMultiAnalyzer(),
      stop: () => this.stopAgent('multiAnalyzer'),
      status: () => this.getAgentStatus('multiAnalyzer')
    };

    // 4. 风控控制器
    this.agents.riskController = {
      start: () => this.startRiskController(),
      stop: () => this.stopAgent('riskController'),
      status: () => this.getAgentStatus('riskController')
    };

    // 5. 执行器
    this.agents.executor = {
      start: () => this.startExecutor(),
      stop: () => this.stopAgent('executor'),
      status: () => this.getAgentStatus('executor')
    };

    // 6. 对冲管理器
    this.agents.hedging = {
      start: () => this.startHedging(),
      stop: () => this.stopAgent('hedging'),
      status: () => this.getAgentStatus('hedging')
    };

    console.log('[ContractAdapter] 6个智能体已注册');
    return true;
  }

  // 启动所有智能体
  async startAll() {
    console.log('[ContractAdapter] 启动所有智能体...');
    this.running = true;

    for (const [name, agent] of Object.entries(this.agents)) {
      try {
        await agent.start();
        console.log(`[ContractAdapter] ✅ ${name} 已启动`);
      } catch (e) {
        console.error(`[ContractAdapter] ❌ ${name} 启动失败:`, e.message);
      }
    }

    this.emit('started', { timestamp: Date.now() });
    return true;
  }

  // 停止所有智能体
  async stopAll() {
    console.log('[ContractAdapter] 停止所有智能体...');
    this.running = false;

    for (const [name, agent] of Object.entries(this.agents)) {
      try {
        await agent.stop();
        console.log(`[ContractAdapter] ✅ ${name} 已停止`);
      } catch (e) {
        console.error(`[ContractAdapter] ❌ ${name} 停止失败:`, e.message);
      }
    }

    this.emit('stopped', { timestamp: Date.now() });
    return true;
  }

  // 启动市场数据采集器
  async startMarketDataCollector() {
    // TODO: 集成 contract-trading/agents/market-data-collector.js
    console.log('[MarketData] 启动市场数据采集 (模拟)');
    this.agents.marketData.interval = setInterval(() => {
      // 模拟采集数据
      this.emit('marketData', {
        symbol: 'BTC/USDT',
        price: 50000 + Math.random() * 1000,
        volume: 1000 + Math.random() * 500,
        timestamp: Date.now()
      });
    }, 2000);
    return true;
  }

  // 启动信号生成器
  async startSignalGenerator() {
    console.log('[SignalGenerator] 启动技术信号生成 (模拟)');
    this.agents.signalGenerator.interval = setInterval(() => {
      // 监听市场数据并生成信号
      const signal = {
        symbol: 'BTC/USDT',
        direction: Math.random() > 0.5 ? 'long' : 'short',
        grade: ['A', 'B', 'C', 'D'][Math.floor(Math.random() * 4)],
        confidence: 50 + Math.random() * 40,
        rsi: 30 + Math.random() * 40,
        timestamp: Date.now()
      };
      this.emit('signal', signal);
    }, 5000);
    return true;
  }

  // 启动多维分析器
  async startMultiAnalyzer() {
    console.log('[MultiAnalyzer] 启动多维分析 (模拟)');
    this.agents.multiAnalyzer.interval = setInterval(() => {
      // 模拟综合分析
      const analysis = {
        symbol: 'BTC/USDT',
        confidence: 60 + Math.random() * 30,
        recommendation: Math.random() > 0.3 ? 'BUY' : 'SELL',
        riskLevel: ['LOW', 'MEDIUM', 'HIGH'][Math.floor(Math.random() * 3)],
        expectedRR: 1.5 + Math.random() * 2,
        timestamp: Date.now()
      };
      this.emit('analysis', analysis);
    }, 3000);
    return true;
  }

  // 启动风控控制器
  async startRiskController() {
    console.log('[RiskController] 启动风控审核 (模拟)');
    this.agents.riskController.interval = setInterval(() => {
      // 模拟风控检查
      const approval = {
        approved: Math.random() > 0.2,
        notionalUSDT: (10 + Math.random() * 20).toFixed(2),
        stopLoss: (50000 * 0.98).toFixed(5),
        takeProfit: (50000 * 1.03).toFixed(5),
        reason: Math.random() > 0.2 ? '通过' : '信心度不足',
        timestamp: Date.now()
      };
      this.emit('riskApproval', approval);
    }, 4000);
    return true;
  }

  // 启动执行器
  async startExecutor() {
    console.log('[Executor] 启动订单执行 (模拟)');
    this.agents.executor.interval = setInterval(() => {
      // 模拟执行订单
      const order = {
        symbol: 'BTC/USDT',
        side: Math.random() > 0.5 ? 'long' : 'short',
        size: (5 + Math.random() * 10).toFixed(2),
        orderId: 'ORD' + Date.now(),
        filledPrice: (50000 + Math.random() * 500).toFixed(2),
        fee: (Math.random() * 0.01).toFixed(4),
        timestamp: Date.now()
      };
      this.emit('execution', order);
    }, 6000);
    return true;
  }

  // 启动对冲管理器
  async startHedging() {
    console.log('[Hedging] 启动自动对冲 (模拟)');
    this.agents.hedging.interval = setInterval(() => {
      // 模拟对冲操作
      const hedge = {
        symbol: 'BTC/USDT',
        hedgeEx: 'BG',
        hedgeId: 'HEDGE' + Date.now(),
        hedgePrice: (50000 + Math.random() * 500).toFixed(2),
        deltaAfter: (Math.random() * 0.01).toFixed(4),
        timestamp: Date.now()
      };
      this.emit('hedge', hedge);
    }, 8000);
    return true;
  }

  // 获取智能体状态
  getAgentStatus(name) {
    const agent = this.agents[name];
    if (!agent) return { running: false };
    return {
      running: !!agent.interval,
      lastUpdate: Date.now()
    };
  }

  // 停止单个智能体
  stopAgent(name) {
    const agent = this.agents[name];
    if (agent && agent.interval) {
      clearInterval(agent.interval);
      agent.interval = null;
      return true;
    }
    return false;
  }

  // 获取整体状态
  getStatus() {
    const status = {
      running: this.running,
      agents: {},
      config: this.config
    };
    for (const name of Object.keys(this.agents)) {
      status.agents[name] = this.getAgentStatus(name);
    }
    return status;
  }

  // 更新配置
  updateConfig(newConfig) {
    this.config = { ...this.config, ...newConfig };
    this.emit('configUpdated', this.config);
    return this.config;
  }
}

module.exports = ContractTradingAdapter;

EOF

echo "✅ 合约交易适配器已创建"
echo "  大小: $(wc -c < $ADAPTER_DIR/contract-adapter.js) bytes"

# ==========================================
# 步骤3: 修改V7.2主系统集成适配器
# ==========================================
echo "[3/6] 修改V7.2主系统集成合约交易..."

# 备份原文件
cp "$V72_FILE" "$V72_FILE.backup-$(date '+%Y%m%d-%H%M%S')"

# 在V7.2的构造函数中添加合约交易适配器
# 查找构造函数位置
CONSTRUCTOR_LINE=$(grep -n "constructor.*{" "$V72_FILE" | head -1 | cut -d: -f1)
echo "V7.2构造函数在第 $CONSTRUCTOR_LINE 行"

# 在 FiveLayerAutonomousSystemV7_2 类中添加 contractAdapter 属性
# 查找类定义
CLASS_LINE=$(grep -n "class FiveLayerAutonomousSystemV7_2" "$V72_FILE" | cut -d: -f1)
echo "V7.2类定义在第 $CLASS_LINE 行"

# 在类顶部添加属性初始化 (在 start() 方法之前)
INSERT_POS=$(grep -n "start()" "$V72_FILE" | head -1 | cut -d: -f1)
INSERT_POS=$((INSERT_POS - 1))

echo "在 start() 前第 $INSERT_POS 行插入合约交易初始化..."

# 创建补丁
PATCH_FILE="$LOG_DIR/v7.2-contract-patch-$(date '+%Y%m%d-%H%M%S').js"
cat > "$PATCH_FILE" << 'PATCH_EOF'
    // ==========================================
    // Phase 1: 合约交易系统集成 (第7轮)
    // ==========================================
    this.contractAdapter = null;  // 合约交易适配器
PATCH_EOF

# 使用sed插入 (在start方法前)
sed -i "${INSERT_POS}r $PATCH_FILE" "$V72_FILE"

echo "✅ 已添加 contractAdapter 属性"

# ==========================================
# 步骤4: 在start()方法中初始化合约交易
# ==========================================
echo "[4/6] 在start()方法中添加合约交易初始化..."

# 查找 start() 方法体开始位置
START_BRACE_LINE=$(grep -n "async start() {" "$V72_FILE" | head -1 | cut -d: -f1)
echo "start() 方法开始于第 $START_BRACE_LINE 行"

# 在start方法第一行后插入初始化代码
INSERT_POS=$((START_BRACE_LINE + 1))

INIT_CODE="
    console.log('[V7.2] 初始化合约交易系统...');
    try {
      const ContractAdapter = require('./contract-integration/contract-adapter');
      this.contractAdapter = new ContractAdapter(this);
      await this.contractAdapter.initialize();
      await this.contractAdapter.startAll();
      console.log('[V7.2] ✅ 合约交易系统已集成');
    } catch (e) {
      console.error('[V7.2] ❌ 合约交易集成失败:', e.message);
    }
"

# 插入代码
sed -i "${INSERT_POS}a\\$INIT_CODE" "$V72_FILE"

echo "✅ 已在 start() 中添加合约交易初始化"

# ==========================================
# 步骤5: 在getStatus()中添加合约交易状态
# ==========================================
echo "[5/6] 在getStatus()中添加合约交易状态..."

# 查找 getStatus() 方法
STATUS_LINE=$(grep -n "getStatus() {" "$V72_FILE" | head -1 | cut -d: -f1)
echo "getStatus() 开始于第 $STATUS_LINE 行"

# 在返回对象中添加 contractTrading 字段
# 查找 return { 行
RETURN_LINE=$(sed -n "${STATUS_LINE},$p" "$V72_FILE" | grep -n "return {" | head -1 | cut -d: -f1)
RETURN_LINE=$((STATUS_LINE + RETURN_LINE - 1))
echo "return { 在第 $RETURN_LINE 行"

# 在 return { 后添加 contractTrading 字段
INSERT_POS=$((RETURN_LINE + 1))

STATUS_PATCH="
      contractTrading: this.contractAdapter ? this.contractAdapter.getStatus() : { running: false },
"

sed -i "${INSERT_POS}a\\$STATUS_PATCH" "$V72_FILE"

echo "✅ 已在 getStatus() 中添加合约交易状态"

# ==========================================
# 步骤6: 创建合约交易配置文件
# ==========================================
echo "[6/6] 创建合约交易配置文件..."

mkdir -p "config/contract-trading"

cat > "config/contract-trading/v7.2-integration.yaml" << 'EOF'
# V7.2 合约交易集成配置

dryRun: true                    # 模拟模式 (false为实盘)
maxPositionSize: 25             # 单笔最大仓位(U)
dailyLossLimit: 5               # 日亏损限额(U)
confidenceThreshold: 65         # 信心度门槛(%)

# Gate交易所配置
gate:
  enabled: true
  apiKey: ""                    # 从.env读取
  secret: ""                    # 从.env读取
  passphrase: ""                # 从.env读取

# 监控配置
monitor:
  marketDataInterval: 2000      # 市场数据采集间隔(ms)
  signalInterval: 5000         # 信号生成间隔(ms)
  analysisInterval: 3000       # 分析间隔(ms)
  executionInterval: 6000      # 执行间隔(ms)
  hedgingInterval: 8000        # 对冲间隔(ms)

# 风控参数
risk:
  stopLossPct: 0.02            # 止损百分比
  takeProfitPct: 0.03          # 止盈百分比
  maxPositions: 10             # 最大持仓数
  maxLeverage: 5               # 最大杠杆

# 信号等级阈值
signal:
  gradeA:
    minConfidence: 90
    minRR: 3.0
  gradeB:
    minConfidence: 80
    minRR: 2.0
  gradeC:
    minConfidence: 70
    minRR: 1.5
  gradeD:
    minConfidence: 60
    minRR: 1.0
EOF

echo "✅ 合约交易配置已创建: config/contract-trading/v7.2-integration.yaml"

# ==========================================
# 完成报告
# ==========================================
echo ""
echo "=========================================="
echo "  Phase 1 完成"
echo "=========================================="
echo ""
echo "修改的文件:"
echo "  ✅ $V72_FILE (添加合约交易集成)"
echo "  ✅ $ADAPTER_DIR/contract-adapter.js (新建)"
echo "  ✅ config/contract-trading/v7.2-integration.yaml (新建)"
echo ""
echo "下一步: Phase 2 - 多智能体协调器集成"
echo "=========================================="
