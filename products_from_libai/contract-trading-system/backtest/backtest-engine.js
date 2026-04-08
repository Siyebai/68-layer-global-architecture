/**
 * 回测引擎
 * 支持快速历史数据回测 + 绩效分析
 */

const fs = require('fs');
const path = require('path');

class BacktestEngine {
  constructor(client, strategy, config = {}) {
    this.client = client;
    this.strategy = strategy;
    this.config = {
      initialCapital: 10000,
      leverage: 5,
      feeRate: 0.0002, // 0.02% 交易费
      slippage: 0.0005, // 0.05% 滑点
      ...config,
    };

    this.trades = [];
    this.equityCurve = [];
    this.currentPosition = null;
    this.balance = this.config.initialCapital;
  }

  /**
   * 运行回测
   * @param {Array} candles - K线数据 [{timestamp, open, high, low, close, volume}, ...]
   */
  async run(candles) {
    console.log(`🔬 开始回测: ${candles.length} 根K线`);

    for (let i = 50; i < candles.length; i++) { // 从50开始，确保有足够数据计算指标
      const currentCandle = candles[i];
      const historicalCandles = candles.slice(Math.max(0, i - 200), i + 1); // 最近200根用于指标计算

      // 模拟市场数据 (实际回测中不需要真实API调用)
      const mockMarketData = {
        symbol: this.config.symbol,
        ticker: {
          last: currentCandle.close,
          bid: currentCandle.close * 0.9999,
          ask: currentCandle.close * 1.0001,
        },
        orderBook: this.generateMockOrderBook(currentCandle),
        candles: historicalCandles,
      };

      // 获取策略信号
      const signal = await this.strategy.generateSignal(this.config.symbol);
      // 注入当前价格到信号中
      signal.currentPrice = currentCandle.close;

      // 执行交易逻辑
      this.executeTrade(signal, currentCandle);

      // 更新权益曲线
      this.updateEquity(currentCandle);
    }

    // 回测结束，平仓所有持仓
    if (this.currentPosition) {
      this.closePosition(candles[candles.length - 1], 'backtest_end');
    }

    return this.generateReport();
  }

  /**
   * 生成模拟订单簿
   */
  generateMockOrderBook(candle) {
    const spread = candle.close * 0.001;
    return {
      bids: [
        { price: candle.close - spread, size: 1.0 },
        { price: candle.close - spread * 2, size: 1.5 },
      ],
      asks: [
        { price: candle.close + spread, size: 1.0 },
        { price: candle.close + spread * 2, size: 1.5 },
      ],
    };
  }

  /**
   * 执行交易
   */
  executeTrade(signal, candle) {
    const { action, confidence, stopLoss, takeProfit, positionSize } = signal;

    // 信号强度不足，忽略
    if (confidence < this.strategy.config.minConfidence) {
      return;
    }

    // 已有持仓，检查是否止盈止损
    if (this.currentPosition) {
      const price = candle.close;
      const pos = this.currentPosition;

      // 检查止损
      if (pos.side === 'buy' && price <= pos.stopLoss) {
        this.closePosition(candle, 'stop_loss');
        return;
      }
      if (pos.side === 'sell' && price >= pos.stopLoss) {
        this.closePosition(candle, 'stop_loss');
        return;
      }

      // 检查止盈
      if (pos.side === 'buy' && price >= pos.takeProfit) {
        this.closePosition(candle, 'take_profit');
        return;
      }
      if (pos.side === 'sell' && price <= pos.takeProfit) {
        this.closePosition(candle, 'take_profit');
        return;
      }

      // 信号反转，平仓后反向开仓
      if ((pos.side === 'buy' && action === 'sell') || (pos.side === 'sell' && action === 'buy')) {
        this.closePosition(candle, 'signal_reverse');
        this.openPosition(signal, candle);
      }

      return;
    }

    // 无持仓，开新仓
    if (action === 'buy' || action === 'sell') {
      this.openPosition(signal, candle);
    }
  }

  /**
   * 开仓
   */
  openPosition(signal, candle) {
    const price = candle.close;
    const size = signal.positionSize || 1;
    const leverage = signal.leverage || this.config.leverage;

    // 计算保证金
    const margin = (price * size) / leverage;

    // 检查余额
    if (margin > this.balance) {
      console.log(`⚠️  余额不足，无法开仓: 需要 ${margin}, 余额 ${this.balance}`);
      return;
    }

    this.currentPosition = {
      side: signal.action,
      entryPrice: price,
      size,
      leverage,
      margin,
      stopLoss: signal.stopLoss,
      takeProfit: signal.takeProfit,
      openTime: candle.timestamp,
      openReason: signal.reason,
    };

    // 扣除保证金和手续费
    const fee = price * size * this.config.feeRate;
    this.balance -= margin + fee;

    console.log(`📈 开仓: ${signal.action.toUpperCase()} ${size} @ ${price} (止损: ${signal.stopLoss}, 止盈: ${signal.takeProfit})`);
  }

  /**
   * 平仓
   */
  closePosition(candle, reason) {
    const pos = this.currentPosition;
    const price = candle.close;
    const pnl = this.calculatePnL(pos, price);

    // 归还保证金 + 盈亏
    this.balance += pos.margin + pnl;

    // 记录交易
    this.trades.push({
      side: pos.side,
      entryPrice: pos.entryPrice,
      exitPrice: price,
      size: pos.size,
      leverage: pos.leverage,
      pnl,
      roi: pnl / pos.margin,
      openTime: pos.openTime,
      closeTime: candle.timestamp,
      duration: candle.timestamp - pos.openTime,
      reason,
      openReason: pos.openReason,
    });

    console.log(`📉 平仓: ${pos.side.toUpperCase()} ${pos.size} @ ${price} 盈亏: ${pnl.toFixed(2)} (${(pnl/pos.margin*100).toFixed(2)}%) 原因: ${reason}`);

    this.currentPosition = null;
  }

  /**
   * 计算盈亏
   */
  calculatePnL(position, exitPrice) {
    const { side, entryPrice, size, leverage } = position;
    const priceChange = (exitPrice - entryPrice) / entryPrice;
    const rawPnL = size * entryPrice * priceChange * leverage;

    // 扣除反向手续费 (平仓)
    const fee = size * exitPrice * this.config.feeRate;
    return rawPnL - fee;
  }

  /**
   * 更新权益曲线
   */
  updateEquity(candle) {
    let equity = this.balance;

    // 加上未实现盈亏
    if (this.currentPosition) {
      const unrealizedPnL = this.calculatePnL(this.currentPosition, candle.close);
      equity += unrealizedPnL;
    }

    this.equityCurve.push({
      timestamp: candle.timestamp,
      equity,
      balance: this.balance,
      position: this.currentPosition ? 1 : 0,
    });
  }

  /**
   * 生成报告
   */
  generateReport() {
    const totalTrades = this.trades.length;
    const winningTrades = this.trades.filter(t => t.pnl > 0).length;
    const losingTrades = this.trades.filter(t => t.pnl < 0).length;
    const winRate = totalTrades > 0 ? winningTrades / totalTrades : 0;

    const totalProfit = this.trades.reduce((sum, t) => sum + t.pnl, 0);
    const grossProfit = this.trades.filter(t => t.pnl > 0).reduce((sum, t) => sum + t.pnl, 0);
    const grossLoss = Math.abs(this.trades.filter(t => t.pnl < 0).reduce((sum, t) => sum + t.pnl, 0));
    const profitFactor = grossLoss > 0 ? grossProfit / grossLoss : 0;

    const avgWin = winningTrades > 0 ? grossProfit / winningTrades : 0;
    const avgLoss = losingTrades > 0 ? grossLoss / losingTrades : 0;
    const avgRoi = totalTrades > 0 ? (totalProfit / this.config.initialCapital) / totalTrades : 0;

    // 计算最大回撤
    let peak = this.equityCurve[0]?.equity || 0;
    let maxDrawdown = 0;
    for (const point of this.equityCurve) {
      if (point.equity > peak) peak = point.equity;
      const drawdown = (peak - point.equity) / peak;
      if (drawdown > maxDrawdown) maxDrawdown = drawdown;
    }

    // 计算夏普比率 (简化，日收益)
    const returns = [];
    for (let i = 1; i < this.equityCurve.length; i++) {
      const prev = this.equityCurve[i - 1].equity;
      const curr = this.equityCurve[i].equity;
      if (prev > 0) {
        returns.push((curr - prev) / prev);
      }
    }
    const avgReturn = returns.reduce((a, b) => a + b, 0) / returns.length;
    const stdReturn = Math.sqrt(returns.reduce((sum, r) => sum + Math.pow(r - avgReturn, 2), 0) / returns.length);
    const sharpeRatio = stdReturn > 0 ? avgReturn / stdReturn * Math.sqrt(365 * 24) : 0; // 年化

    return {
      summary: {
        totalTrades,
        winRate: winRate * 100,
        totalProfit,
        profitFactor,
        maxDrawdown: maxDrawdown * 100,
        avgWin,
        avgLoss,
        avgRoi: avgRoi * 100,
        sharpeRatio,
        finalEquity: this.equityCurve[this.equityCurve.length - 1]?.equity || 0,
        totalReturn: ((this.equityCurve[this.equityCurve.length - 1]?.equity || 0) - this.config.initialCapital) / this.config.initialCapital * 100,
      },
      trades: this.trades,
      equityCurve: this.equityCurve,
    };
  }

  /**
   * 导出结果到文件
   */
  async exportReport(outputDir = './reports') {
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }

    const report = this.generateReport();
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const filename = path.join(outputDir, `backtest-${timestamp}.json`);

    fs.writeFileSync(filename, JSON.stringify(report, null, 2));
    console.log(`📊 回测报告已保存: ${filename}`);

    return report;
  }

  /**
   * 打印摘要
   */
  printSummary() {
    const report = this.generateReport();
    const s = report.summary;

    console.log('\n' + '='.repeat(60));
    console.log('📊 回测结果摘要');
    console.log('='.repeat(60));
    console.log(`总交易数: ${s.totalTrades}`);
    console.log(`胜率: ${s.winRate.toFixed(2)}%`);
    console.log(`总盈亏: ${s.totalProfit.toFixed(2)} (${s.totalReturn.toFixed(2)}%)`);
    console.log(`利润因子: ${s.profitFactor.toFixed(2)}`);
    console.log(`最大回撤: ${s.maxDrawdown.toFixed(2)}%`);
    console.log(`平均盈利: ${s.avgWin.toFixed(2)}`);
    console.log(`平均亏损: ${s.avgLoss.toFixed(2)}`);
    console.log(`平均ROI: ${s.avgRoi.toFixed(2)}%`);
    console.log(`夏普比率: ${s.sharpeRatio.toFixed(2)}`);
    console.log(`最终权益: ${s.finalEquity.toFixed(2)}`);
    console.log('='.repeat(60) + '\n');
  }
}

module.exports = BacktestEngine;