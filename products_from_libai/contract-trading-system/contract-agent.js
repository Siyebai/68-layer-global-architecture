/**
 * 合约交易 Agent
 * 集成 OKX 合约客户端 + 高胜率策略 + 信号融合
 */

const { EventEmitter } = require('events');
const OKXContractClient = require('../exchange-adapters/okx-contract-client');
const HighWinrateStrategy = require('../strategies/high-winrate-strategy');
const SignalFusionEngine = require('../strategies/signal-fusion-engine');
const TechnicalIndicators = require('../strategies/technical-indicators');

class ContractTradingAgent extends EventEmitter {
  constructor(id, config = {}) {
    super();
    this.id = id;
    this.config = config;
    this.client = null;
    this.strategy = null;
    this.fusion = null;
    this.state = 'initializing';
    this.metrics = {
      signalsGenerated: 0,
      tradesExecuted: 0,
      errors: 0,
      profit: 0,
    };
    this.lastUpdate = Date.now();
  }

  async initialize(redis) {
    this.redis = redis;
    this.state = 'connecting';

    // 1. 初始化 OKX 合约客户端
    this.client = new OKXContractClient({
      apiKey: process.env.OKX_API_KEY,
      secretKey: process.env.OKX_SECRET_KEY,
      passphrase: process.env.OKX_PASSPHRASE,
    });

    // 2. 初始化策略
    this.strategy = new HighWinrateStrategy(this.client, this.config.strategy);

    // 3. 初始化信号融合引擎
    this.fusion = new SignalFusionEngine();
    this.fusion.registerStrategy('high_winrate', 1.0);

    // 4. 连接 WebSocket
    this.client.connectWebSocket();
    this.client.subscribeAccount();

    this.client.on('ticker', (data) => this.handleTicker(data));
    this.client.on('orderbook', (data) => this.handleOrderBook(data));
    this.client.on('position', (data) => this.handlePosition(data));
    this.client.on('error', (err) => this.handleError(err));

    this.state = 'running';
    this.lastUpdate = Date.now();
    console.log(`[ContractAgent ${this.id}] 初始化完成`);

    // 启动交易循环
    this.startTradingLoop();
  }

  async handleTicker(ticker) {
    this.currentPrice = ticker.last;
  }

  async handleOrderBook(orderBook) {
    this.orderBook = orderBook;
  }

  async handlePosition(position) {
    this.position = position;
  }

  async handleError(err) {
    this.metrics.errors++;
    this.emit('error', err);
  }

  /**
   * 交易主循环
   */
  startTradingLoop() {
    const loop = async () => {
      try {
        if (this.state !== 'running') return;

        // 获取配置的交易对
        const symbols = this.config.symbols || ['BTC-USDT-SWAP'];

        for (const symbol of symbols) {
          // 1. 生成信号
          const signal = await this.strategy.generateSignal(symbol);
          this.metrics.signalsGenerated++;

          // 2. 获取市场上下文
          const context = this.getMarketContext(symbol);

          // 3. 发送到融合引擎
          this.fusion.receiveSignal('high_winrate', signal, context);

          // 4. 获取最终决策
          const decision = this.fusion.fuseSignals(context);

          // 5. 执行交易 (如果信号足够强)
          if (decision.confidence > 0.6 && decision.action !== 'hold') {
            await this.executeTrade(symbol, decision);
          }

          // 6. 定期评估策略表现 (每小时)
          if (Date.now() % 3600000 < 60000) {
            this.evaluatePerformance();
          }
        }
      } catch (err) {
        this.metrics.errors++;
        console.error(`[ContractAgent ${this.id}] Loop error:`, err.message);
      }

      // 下一次循环延迟 (V26 周期 80ms，这里用 100ms)
      setTimeout(loop, 100);
    };

    loop();
  }

  /**
   * 获取市场上下文
   */
  getMarketContext(symbol) {
    return {
      symbol,
      price: this.currentPrice,
      orderBook: this.orderBook,
      position: this.position,
      timestamp: Date.now(),
      volatility: this.calculateVolatility(),
      trendStrength: this.calculateTrendStrength(),
      volumeRatio: this.calculateVolumeRatio(),
    };
  }

  /**
   * 计算波动率 (基于ATR)
   */
  calculateVolatility() {
    // 简化: 使用最近的 ticker 变化
    return 0.001; // TODO: 从指标计算
  }

  /**
   * 计算趋势强度
   */
  calculateTrendStrength() {
    // 简化: 基于价格与均线距离
    return 0.6; // TODO: 从指标计算
  }

  /**
   * 计算成交量比率
   */
  calculateVolumeRatio() {
    return 1.2; // TODO: 从历史数据计算
  }

  /**
   * 执行交易
   */
  async executeTrade(symbol, decision) {
    try {
      // 检查是否已有持仓
      const positions = await this.client.getPositions(symbol);
      const hasPosition = positions.length > 0 && parseFloat(positions[0].im) !== 0;

      if (hasPosition) {
        // 已有持仓，检查是否反向信号
        const currentSide = positions[0].posId; // 'long' 或 'short' (简化)
        if ((currentSide === 'long' && decision.action === 'sell') ||
            (currentSide === 'short' && decision.action === 'buy')) {
          // 平仓
          await this.closePosition(symbol, positions[0]);
        }
        return;
      }

      // 无持仓，开新仓
      const side = decision.action === 'buy' ? 'long' : 'short';
      const order = await this.client.placeOrder({
        instId: symbol,
        side: decision.action,
        ordType: 'market',
        sz: decision.positionSize,
        posSide: side,
        tdMode: 'isolated',
      });

      this.metrics.tradesExecuted++;
      this.emit('trade_executed', { order, decision });

      console.log(`[ContractAgent ${this.id}] 开仓成功: ${symbol} ${decision.action} ${decision.positionSize} @ ${this.currentPrice}`);
    } catch (err) {
      this.metrics.errors++;
      console.error(`[ContractAgent ${this.id}] 交易失败:`, err.message);
    }
  }

  /**
   * 平仓
   */
  async closePosition(symbol, position) {
    try {
      const side = position.posId === 'long' ? 'sell' : 'buy';
      const order = await this.client.placeOrder({
        instId: symbol,
        side,
        ordType: 'market',
        sz: Math.abs(parseFloat(position.im)), // 持仓数量
        posSide: position.posId,
        tdMode: 'isolated',
      });

      this.metrics.tradesExecuted++;
      this.emit('position_closed', { order, position });

      console.log(`[ContractAgent ${this.id}] 平仓成功: ${symbol} ${side} ${position.im}`);
    } catch (err) {
      this.metrics.errors++;
      console.error(`[ContractAgent ${this.id}] 平仓失败:`, err.message);
    }
  }

  /**
   * 评估策略表现
   */
  evaluatePerformance() {
    // 从数据库查询最近交易，更新策略权重
    // TODO: 实现数据库查询
    console.log(`[ContractAgent ${this.id}] 评估表现，调整策略权重`);
  }

  getHealth() {
    return {
      id: this.id,
      type: 'contract-trader',
      state: this.state,
      signals: this.metrics.signalsGenerated,
      trades: this.metrics.tradesExecuted,
      errors: this.metrics.errors,
      lastUpdate: this.lastUpdate,
    };
  }

  async shutdown() {
    this.state = 'stopping';
    if (this.client) {
      this.client.disconnect();
    }
    this.state = 'stopped';
  }
}

module.exports = ContractTradingAgent;