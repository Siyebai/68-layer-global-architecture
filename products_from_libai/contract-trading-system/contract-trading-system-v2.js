/**
 * 合约交易系统 V2.0 - 企业级整合版
 * 基于知识库最佳实践，集成 Redis Streams、监控、风控、实验框架
 */

const { EventEmitter } = require('events');
const OKXContractClient = require('../products/exchange-adapters/okx-contract-client');
const HighWinrateStrategy = require('../products/contract-trading-system/strategies/high-winrate-strategy');
const SignalFusionEngine = require('../products/contract-trading-system/strategies/signal-fusion-engine');
const CommunicationLayer = require('../../lib/communication');
const MonitoringService = require('../../lib/monitoring');
const RiskManager = require('../../lib/risk-manager');
const ExperimentManager = require('../../lib/experiment-manager');

class ContractTradingSystem extends EventEmitter {
  constructor(config = {}) {
    super();
    this.config = config;
    this.agentId = config.agentId || `contract-trader-${Date.now()}`;
    this.state = 'initializing';
    this.metrics = {
      signalsGenerated: 0,
      tradesExecuted: 0,
      errors: 0,
      profit: 0,
    };
    this.startTime = Date.now();
  }

  async initialize() {
    console.log(`[${this.agentId}] 初始化合约交易系统 V2.0...`);

    // 1. 初始化 Redis 通信层
    this.comms = new CommunicationLayer({
      host: process.env.REDIS_HOST || 'localhost',
      port: process.env.REDIS_PORT || 6379,
      password: process.env.REDIS_PASSWORD,
    });
    await this.comms.initialize(this.agentId, 'contract-trader');
    console.log(`[${this.agentId}] 通信层已就绪`);

    // 2. 初始化监控服务
    this.monitoring = new MonitoringService(this.comms.redis, {
      port: process.env.METRICS_PORT || 9090,
    });
    this.monitoring.start();
    console.log(`[${this.agentId}] 监控服务已启动 :${process.env.METRICS_PORT || 9090}`);

    // 3. 初始化 OKX 合约客户端
    this.client = new OKXContractClient({
      apiKey: process.env.OKX_API_KEY,
      secretKey: process.env.OKX_SECRET_KEY,
      passphrase: process.env.OKX_PASSPHRASE,
    });
    this.client.connectWebSocket();
    console.log(`[${this.agentId}] OKX合约客户端已连接`);

    // 4. 初始化策略
    this.strategy = new HighWinrateStrategy(this.client, this.config.strategy);
    this.fusion = new SignalFusionEngine();
    this.fusion.registerStrategy('high_winrate', 1.0);
    console.log(`[${this.agentId}] 策略引擎已初始化`);

    // 5. 初始化风险管理系统
    this.riskManager = new RiskManager(this.config.risk);
    console.log(`[${this.agentId}] 风控系统已就绪`);

    // 6. 初始化实验管理器 (A/B测试)
    this.experimentManager = new ExperimentManager(this.comms.redis);
    console.log(`[${this.agentId}] 实验管理器已就绪`);

    // 7. 订阅市场数据
    this.client.subscribeAccount();
    const symbols = this.config.symbols || ['BTC-USDT-SWAP', 'ETH-USDT-SWAP'];
    symbols.forEach(symbol => {
      this.client.subscribe(symbol, 'tickers');
      this.client.subscribe(symbol, 'books');
    });
    console.log(`[${this.agentId}] 已订阅 ${symbols.length} 个交易对`);

    // 8. 启动心跳定时器
    this.heartbeatInterval = setInterval(() => this.sendHeartbeat(), 30000);

    // 9. 启动交易循环
    this.tradingLoop = this.startTradingLoop();

    // 10. 启动实验自动分析 (每日)
    this.experimentCheckInterval = setInterval(() => {
      this.experimentManager.autoAnalyzeRunningExperiments();
    }, 3600000); // 每小时检查一次

    this.state = 'running';
    console.log(`[${this.agentId}] 合约交易系统 V2.0 启动完成!`);

    // 上报系统启动事件
    this.comms.publish('events:system', {
      type: 'system_started',
      agentId: this.agentId,
      timestamp: Date.now(),
      config: this.config,
    });
  }

  async sendHeartbeat() {
    await this.comms.heartbeat();
    this.monitoring.updateActiveConnections('redis', 1);

    // 更新系统状态
    const status = this.getSystemStatus();
    await this.comms.redis.hset(`agent:${this.agentId}:status`, 'status', JSON.stringify(status));
  }

  startTradingLoop() {
    const loop = async () => {
      if (this.state !== 'running') return;

      try {
        const symbols = this.config.symbols || ['BTC-USDT-SWAP'];

        for (const symbol of symbols) {
          // 1. 获取当前价格和持仓
          const ticker = await this.client.getTicker(symbol);
          const positions = await this.client.getPositions(symbol);
          const hasPosition = positions.length > 0 && parseFloat(positions[0].im) > 0;

          // 2. 生成信号
          const signal = await this.strategy.generateSignal(symbol);
          this.metrics.signalsGenerated++;

          // 记录信号生成延迟
          const signalLatency = Date.now() - signal.timestamp;
          this.monitoring.recordAgentLatency(this.agentId, 'signal_generation', signalLatency);

          // 3. 获取市场上下文
          const context = this.getMarketContext(symbol, ticker, positions);

          // 4. 发送到融合引擎
          this.fusion.receiveSignal('high_winrate', signal, context);

          // 5. 实验分配 (如果有正在进行的实验)
          const experimentId = this.config.experimentId;
          if (experimentId) {
            const variant = this.experimentManager.assignVariant(experimentId, this.agentId);
            // 根据实验组调整策略参数
            this.applyVariantParams(variant);
          }

          // 6. 获取最终决策
          const decision = this.fusion.fuseSignals(context);

          // 7. 风险检查
          const riskAssessment = await this.riskManager.assess(decision, this.config.accountBalance || 10000);
          if (!riskAssessment.passed) {
            console.log(`[${this.agentId}] 风控拒绝: ${riskAssessment.reasons.join(', ')}`);
            this.monitoring.recordAgentError(this.agentId, 'risk_rejected');
            continue;
          }

          // 应用风控调整
          if (riskAssessment.adjustments.quantity) {
            decision.positionSize = riskAssessment.adjustments.quantity;
          }

          // 8. 执行交易 (如果信号足够强)
          if (decision.confidence > 0.6 && decision.action !== 'hold') {
            const tradeResult = await this.executeTrade(symbol, decision);
            if (tradeResult.success) {
              this.metrics.tradesExecuted++;
              this.monitoring.recordOrder(symbol, decision.action, 'market');

              // 记录盈亏
              this.metrics.profit += tradeResult.pnl || 0;
              this.riskManager.recordTrade({
                symbol,
                side: decision.action,
                pnl: tradeResult.pnl,
                balanceAfter: this.config.accountBalance + this.metrics.profit,
                exchange: 'okx',
                orderId: tradeResult.orderId,
              });

              // 更新监控指标
              this.monitoring.updatePnL(symbol, 'daily', this.metrics.profit);
            }
          }

          // 9. 更新策略表现指标 (每小时)
          if (Date.now() % 3600000 < 60000) {
            this.updateStrategyMetrics();
          }
        }
      } catch (err) {
        this.metrics.errors++;
        this.monitoring.recordAgentError(this.agentId, err.message);
        console.error(`[${this.agentId}] 交易循环错误:`, err.message);
      }

      // V26 周期 80ms，这里使用 100ms
      setTimeout(loop, 100);
    };

    return loop();
  }

  async executeTrade(symbol, decision) {
    try {
      // 检查是否已有持仓
      const positions = await this.client.getPositions(symbol);
      const hasPosition = positions.length > 0 && parseFloat(positions[0].im) !== 0;

      if (hasPosition) {
        // 已有持仓，检查是否反向信号
        const currentSide = positions[0].posSide; // 'long' 或 'short'
        if ((currentSide === 'long' && decision.action === 'sell') ||
            (currentSide === 'short' && decision.action === 'buy')) {
          // 平仓
          const closeResult = await this.closePosition(symbol, positions[0], decision);
          return { success: true, ...closeResult };
        }
        return { success: false, reason: 'already_has_position' };
      }

      // 无持仓，开新仓
      const side = decision.action === 'buy' ? 'long' : 'short';
      const order = await this.client.placeOrder({
        instId: symbol,
        side: decision.action,
        ordType: 'market',
        sz: Math.floor(decision.positionSize),
        posSide: side,
        tdMode: 'isolated',
      });

      this.monitoring.recordFill(symbol, decision.action);

      console.log(`[${this.agentId}] 开仓成功: ${symbol} ${decision.action} ${decision.positionSize} @ ${this.currentPrice || 'market'}`);

      return {
        success: true,
        orderId: order.ordId,
        pnl: 0, // 开仓时无盈亏
        action: 'open',
      };
    } catch (err) {
      console.error(`[${this.agentId}] 交易失败:`, err.message);
      this.monitoring.recordAgentError(this.agentId, 'trade_execution_failed');
      return { success: false, error: err.message };
    }
  }

  async closePosition(symbol, position, decision) {
    try {
      const posSide = position.posSide; // 'long' 或 'short'
      const side = posSide === 'long' ? 'sell' : 'buy';
      const sz = Math.abs(parseFloat(position.im)); // 持仓数量

      const order = await this.client.placeOrder({
        instId: symbol,
        side,
        ordType: 'market',
        sz,
        posSide,
        tdMode: 'isolated',
      });

      // 计算盈亏 (简化: 使用当前价格与平均成本)
      const entryPx = parseFloat(position.avgPx);
      const exitPx = this.currentPrice || parseFloat(position.last);
      const pnl = (exitPx - entryPx) * sz * (posSide === 'long' ? 1 : -1);

      this.monitoring.recordFill(symbol, side);

      console.log(`[${this.agentId}] 平仓成功: ${symbol} ${side} ${sz} @ ${exitPx} P&L: ${pnl.toFixed(2)}`);

      return {
        success: true,
        orderId: order.ordId,
        pnl,
        action: 'close',
      };
    } catch (err) {
      console.error(`[${this.agentId}] 平仓失败:`, err.message);
      this.monitoring.recordAgentError(this.agentId, 'close_position_failed');
      return { success: false, error: err.message };
    }
  }

  getMarketContext(symbol, ticker, positions) {
    return {
      symbol,
      price: parseFloat(ticker.last),
      bid: parseFloat(ticker.bidPx),
      ask: parseFloat(ticker.askPx),
      spread: (parseFloat(ticker.askPx) - parseFloat(ticker.bidPx)) / parseFloat(ticker.last),
      volume: parseFloat(ticker.vol24h),
      positions: positions.map(p => ({
        side: p.posSide,
        size: parseFloat(p.im),
        leverage: parseFloat(p.lever),
        pnl: parseFloat(p.upl) + parseFloat(p.rpl),
      })),
      timestamp: Date.now(),
      // 计算市场状态
      volatility: this.calculateVolatility(symbol),
      trendStrength: this.calculateTrendStrength(symbol),
      volumeRatio: this.calculateVolumeRatio(symbol),
    };
  }

  calculateVolatility(symbol) {
    // TODO: 从缓存或历史数据计算
    return 0.001; // 0.1%
  }

  calculateTrendStrength(symbol) {
    // TODO: 从技术指标计算
    return 0.6; // 中等趋势
  }

  calculateVolumeRatio(symbol) {
    // TODO: 计算当前成交量/平均成交量
    return 1.2; // 高于平均
  }

  applyVariantParams(variantId) {
    // 根据实验组调整策略参数
    const variantConfigs = {
      control: {
        rsiOverbought: 70,
        rsiOversold: 30,
        minConfidence: 0.65,
      },
      treatment: {
        rsiOverbought: 65,
        rsiOversold: 35,
        minConfidence: 0.60,
      },
    };

    if (variantId && variantConfigs[variantId]) {
      this.strategy.config = { ...this.strategy.config, ...variantConfigs[variantId] };
      console.log(`[${this.agentId}] 应用实验参数: ${variantId}`);
    }
  }

  async updateStrategyMetrics() {
    // 从数据库查询最近表现
    // TODO: 实现
    this.monitoring.updateStrategyMetrics('high_winrate', {
      winRate: 0.58,
      profitFactor: 1.8,
      sharpeRatio: 1.5,
      maxDrawdown: 0.08,
    });
  }

  getSystemStatus() {
    return {
      agentId: this.agentId,
      state: this.state,
      uptime: Date.now() - this.startTime,
      metrics: this.metrics,
      strategy: this.strategy.getPerformance(),
      config: {
        symbols: this.config.symbols,
        accountBalance: this.config.accountBalance,
      },
    };
  }

  async shutdown() {
    console.log(`[${this.agentId}] 正在关闭...`);
    this.state = 'stopping';

    if (this.heartbeatInterval) clearInterval(this.heartbeatInterval);
    if (this.experimentCheckInterval) clearInterval(this.experimentCheckInterval);

    if (this.client) this.client.disconnect();
    if (this.comms) await this.comms.shutdown();

    this.state = 'stopped';
    console.log(`[${this.agentId}] 已关闭`);
  }
}

module.exports = ContractTradingSystem;