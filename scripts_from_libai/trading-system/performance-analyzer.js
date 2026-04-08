#!/usr/bin/env node
/**
 * PerformanceAnalyzer - 绩效分析器
 * 计算交易绩效、回测、优化建议
 * 作者: C李白 | 2026-04-02
 */

const { EventEmitter } = require('events');

class PerformanceAnalyzer extends EventEmitter {
  constructor() {
    super();
    this.initialized = false;
    this.stats = {
      totalTrades: 0,
      winningTrades: 0,
      losingTrades: 0,
      totalPnl: 0,
      grossProfit: 0,
      grossLoss: 0,
      avgWin: 0,
      avgLoss: 0,
      winRate: 0,
      profitFactor: 0,
      sharpeRatio: 0,
      maxDrawdown: 0,
      currentDrawdown: 0,
      avgTradeDuration: 0
    };
    this.trades = [];
    this.equityCurve = [];
    this.peakEquity = 0;
    this.startCapital = 10000;
    this.currentCapital = 10000;
  }

  async initialize() {
    console.log('[PerformanceAnalyzer] 初始化绩效分析器...');
    
    this.peakEquity = this.startCapital;
    this.equityCurve.push({
      timestamp: Date.now(),
      equity: this.currentCapital
    });
    
    this.initialized = true;
    console.log('✅ 绩效分析器已就绪');
  }

  /**
   * 记录订单/交易
   */
  async recordOrder(order) {
    if (!order || order.status !== 'filled') return;
    
    const trade = {
      id: order.orderId,
      symbol: order.symbol,
      side: order.side,
      entryPrice: order.filledPrice,
      exitPrice: null,
      size: order.filledSize,
      pnl: 0,
      duration: 0,
      openedAt: order.filledAt,
      closedAt: null,
      outcome: 'open' // open/win/loss
    };
    
    this.trades.push(trade);
    this.stats.totalTrades++;
    
    // 如果是平仓订单 (reversal或stop触发)
    if (order.reason && (order.reason.includes('stop-loss') || order.reason.includes('take-profit') || order.reason === 'close')) {
      this.closeTrade(trade, order);
    }
  }

  /**
   * 更新持仓并计算未实现盈亏
   */
  updatePositions(positions) {
    // 更新当前权益
    const unrealizedPnl = this.calculateUnrealizedPnl(positions);
    this.currentCapital = this.startCapital + this.stats.totalPnl + unrealizedPnl;
    
    // 更新权益曲线
    this.equityCurve.push({
      timestamp: Date.now(),
      equity: this.currentCapital,
      unrealizedPnl
    });
    
    // 计算回撤
    this.calculateDrawdown();
    
    // 发出性能更新事件 (供V35.0学习)
    this.emit('performanceUpdate', this.getSummary());
  }

  /**
   * 计算未实现盈亏
   */
  calculateUnrealizedPnl(positions) {
    let total = 0;
    for (const pos of positions) {
      // 简化: 使用当前市场价格 (实际应该从市场数据获取)
      const currentPrice = pos.price; // 假设未变化
      if (pos.side === 'buy') {
        total += (currentPrice - pos.price) * pos.size;
      } else {
        total += (pos.price - currentPrice) * pos.size;
      }
    }
    return total;
  }

  /**
   * 平仓交易
   */
  closeTrade(trade, exitOrder) {
    const entryValue = trade.entryPrice * trade.size;
    const exitValue = exitOrder.filledPrice * trade.size;
    
    if (trade.side === 'buy') {
      trade.pnl = exitValue - entryValue;
    } else {
      trade.pnl = entryValue - exitValue;
    }
    
    trade.exitPrice = exitOrder.filledPrice;
    trade.closedAt = exitOrder.filledAt;
    trade.duration = trade.closedAt - trade.openedAt;
    trade.outcome = trade.pnl > 0 ? 'win' : 'loss';
    
    // 更新统计
    if (trade.pnl > 0) {
      this.stats.winningTrades++;
      this.stats.grossProfit += trade.pnl;
    } else {
      this.stats.losingTrades++;
      this.stats.grossLoss += Math.abs(trade.pnl);
    }
    
    this.stats.totalPnl += trade.pnl;
    
    // 重新计算比率
    this.calculateRatios();
  }

  /**
   * 计算绩效比率
   */
  calculateRatios() {
    if (this.stats.totalTrades > 0) {
      this.stats.winRate = (this.stats.winningTrades / this.stats.totalTrades) * 100;
    }
    
    if (this.stats.grossLoss > 0) {
      this.stats.profitFactor = this.stats.grossProfit / this.stats.grossLoss;
    }
    
    if (this.stats.winningTrades > 0) {
      this.stats.avgWin = this.stats.grossProfit / this.stats.winningTrades;
    }
    
    if (this.stats.losingTrades > 0) {
      this.stats.avgLoss = this.stats.grossLoss / this.stats.losingTrades;
    }
    
    // 简化夏普比率 (基于日收益)
    this.calculateSharpeRatio();
  }

  /**
   * 计算夏普比率
   */
  calculateSharpeRatio() {
    if (this.equityCurve.length < 2) {
      this.stats.sharpeRatio = 0;
      return;
    }
    
    // 计算日收益率
    const returns = [];
    for (let i = 1; i < this.equityCurve.length; i++) {
      const prev = this.equityCurve[i-1].equity;
      const curr = this.equityCurve[i].equity;
      if (prev > 0) {
        returns.push((curr - prev) / prev);
      }
    }
    
    if (returns.length === 0) {
      this.stats.sharpeRatio = 0;
      return;
    }
    
    const avgReturn = returns.reduce((a,b) => a+b, 0) / returns.length;
    const variance = returns.reduce((sum, r) => sum + Math.pow(r - avgReturn, 2), 0) / returns.length;
    const stdDev = Math.sqrt(variance);
    
    // 年化 (假设252个交易日)
    const annualizedReturn = avgReturn * 252 * 24 * 60; // 分钟级数据
    const annualizedStdDev = stdDev * Math.sqrt(252 * 24 * 60);
    
    this.stats.sharpeRatio = annualizedStdDev > 0 ? (annualizedReturn / annualizedStdDev) : 0;
  }

  /**
   * 计算回撤
   */
  calculateDrawdown() {
    if (this.currentCapital > this.peakEquity) {
      this.peakEquity = this.currentCapital;
    }
    
    const drawdown = (this.peakEquity - this.currentCapital) / this.peakEquity;
    this.stats.currentDrawdown = drawdown;
    
    if (drawdown > this.stats.maxDrawdown) {
      this.stats.maxDrawdown = drawdown;
    }
  }

  /**
   * 获取统计摘要
   */
  getStats() {
    return this.stats;
  }

  /**
   * 获取绩效摘要 (用于V35.0学习)
   */
  getSummary() {
    return {
      capital: this.currentCapital,
      totalPnl: this.stats.totalPnl,
      returnRate: ((this.currentCapital - this.startCapital) / this.startCapital) * 100,
      winRate: this.stats.winRate,
      profitFactor: this.stats.profitFactor,
      sharpeRatio: this.stats.sharpeRatio,
      maxDrawdown: this.stats.maxDrawdown,
      currentDrawdown: this.stats.currentDrawdown,
      totalTrades: this.stats.totalTrades,
      avgTradeDuration: this.calculateAvgDuration(),
      timestamp: Date.now()
    };
  }

  /**
   * 计算平均交易时长
   */
  calculateAvgDuration() {
    const closedTrades = this.trades.filter(t => t.closedAt);
    if (closedTrades.length === 0) return 0;
    
    const totalDuration = closedTrades.reduce((sum, t) => sum + t.duration, 0);
    return totalDuration / closedTrades.length;
  }

  /**
   * 获取状态 (供V7.2 getStatus调用)
   */
  getStatus() {
    return {
      name: 'performance-analyzer',
      running: this.initialized,
      version: '1.0.0',
      stats: {
        totalTrades: this.stats.totalTrades,
        totalPnl: this.stats.totalPnl,
        winRate: this.stats.winRate,
        sharpeRatio: this.stats.sharpeRatio,
        maxDrawdown: this.stats.maxDrawdown,
        currentDrawdown: this.stats.currentDrawdown
      },
      summary: this.getSummary()
    };
  }

  /**
   * 生成回测报告
   */
  generateBacktestReport(startDate, endDate) {
    // 简化实现
    return {
      period: { start: startDate, end: endDate },
      initialCapital: this.startCapital,
      finalCapital: this.currentCapital,
      totalReturn: this.stats.totalPnl,
      returnRate: ((this.currentCapital - this.startCapital) / this.startCapital) * 100,
      trades: this.trades.length,
      winRate: this.stats.winRate,
      sharpeRatio: this.stats.sharpeRatio,
      maxDrawdown: this.stats.maxDrawdown,
      profitFactor: this.stats.profitFactor
    };
  }
}

module.exports = PerformanceAnalyzer;
