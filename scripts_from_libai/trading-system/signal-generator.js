#!/usr/bin/env node
/**
 * SignalGenerator - 交易信号生成器
 * 基于技术指标和V35.0决策生成交易信号
 * 作者: C李白 | 2026-04-02
 */

class SignalGenerator {
  constructor(collector, v72System) {
    this.collector = collector;
    this.v72System = v72System;
    this.initialized = false;
    this.stats = {
      signalsGenerated: 0,
      signalsBySymbol: {},
      lastSignalTime: null
    };
    this.indicators = {};
  }

  async initialize() {
    console.log('[SignalGenerator] 初始化信号生成器...');
    
    // 计算技术指标
    this.calculateIndicators();
    
    this.initialized = true;
    console.log('✅ 信号生成器已就绪');
  }

  /**
   * 计算技术指标
   */
  calculateIndicators() {
    const marketData = this.collector.getLatest();
    if (!marketData) return;
    
    for (const symbol of ['BTC-USDT', 'ETH-USDT', 'SOL-USDT']) {
      const tickers = marketData.filter(m => m.symbol === symbol && m.type === 'ticker');
      const trades = marketData.filter(m => m.symbol === symbol && m.type === 'trade');
      
      if (tickers.length > 0) {
        const latest = tickers[tickers.length - 1];
        this.indicators[symbol] = {
          price: latest.last,
          bid: latest.bid,
          ask: latest.ask,
          spread: latest.ask - latest.bid,
          volume24h: latest.volume24h || 0,
          change24h: latest.change24h || 0
        };
      }
    }
  }

  /**
   * 生成交易信号
   */
  async generate(marketData) {
    const signals = [];
    
    for (const symbol of ['BTC-USDT', 'ETH-USDT', 'SOL-USDT']) {
      const signal = this.generateSignalForSymbol(symbol, marketData);
      if (signal) {
        signals.push(signal);
        this.stats.signalsGenerated++;
        this.stats.signalsBySymbol[symbol] = (this.stats.signalsBySymbol[symbol] || 0) + 1;
        this.stats.lastSignalTime = Date.now();
      }
    }
    
    return signals;
  }

  /**
   * 为单个交易对生成信号
   */
  generateSignalForSymbol(symbol, marketData) {
    const indicator = this.indicators[symbol];
    if (!indicator) return null;
    
    // 简单策略: 基于价差和24小时涨跌幅
    const spreadRate = indicator.spread / indicator.price;
    const change = indicator.change24h || 0;
    
    // 价差大于0.1% 且 24h涨幅超过2% → 做多信号
    if (spreadRate > 0.001 && change > 2.0) {
      return {
        symbol: symbol.replace('-', '/'),
        action: 'buy',
        price: indicator.ask,
        size: this.calculatePositionSize(indicator.price),
        confidence: Math.min(50 + change, 95),
        reason: `价差${(spreadRate*100).toFixed(3)}% + 涨幅${change.toFixed(2)}%`,
        timestamp: Date.now()
      };
    }
    
    // 价差大于0.1% 且 24h跌幅超过2% → 做空信号
    if (spreadRate > 0.001 && change < -2.0) {
      return {
        symbol: symbol.replace('-', '/'),
        action: 'sell',
        price: indicator.bid,
        size: this.calculatePositionSize(indicator.price),
        confidence: Math.min(50 + Math.abs(change), 95),
        reason: `价差${(spreadRate*100).toFixed(3)}% + 跌幅${change.toFixed(2)}%`,
        timestamp: Date.now()
      };
    }
    
    return null;
  }

  /**
   * 计算仓位大小
   */
  calculatePositionSize(price) {
    const capital = this.v72System?.tradingCapital || 10000;
    const riskPerTrade = 0.02; // 2% risk
    const positionValue = capital * riskPerTrade;
    const size = positionValue / price;
    
    return Math.max(size, 0.001); // 最小0.001
  }

  getStats() {
    return this.stats;
  }
}

module.exports = SignalGenerator;
