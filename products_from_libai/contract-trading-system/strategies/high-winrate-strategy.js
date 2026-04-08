/**
 * 高胜率合约交易策略
 * 融合: 趋势跟踪 + 均值回归 + 突破确认 + 资金费率
 */

const TechnicalIndicators = require('./technical-indicators');

class HighWinrateStrategy {
  constructor(client, config = {}) {
    this.client = client;
    this.config = {
      // 技术参数
      macdFast: 12,
      macdSlow: 26,
      macdSignal: 9,
      rsiPeriod: 14,
      rsiOverbought: 70,
      rsiOversold: 30,
      kdjPeriod: 14,
      bbPeriod: 20,
      bbStdDev: 2,
      atrPeriod: 14,

      // 交易参数
      minConfidence: 0.65,
      minVolume: 1000000, // 最小成交量 1M
      maxSpread: 0.001,   // 最大价差 0.1%
      fundingRateThreshold: 0.0001, // 资金费率阈值

      // 风控
      stopLossAtrMultiplier: 2,
      takeProfitAtrMultiplier: 3,
      maxPositionSize: 10000,
      maxLeverage: 5,

      ...config,
    };

    this.cache = new Map();
    this.indicators = new TechnicalIndicators();
  }

  /**
   * 生成交易信号
   */
  async generateSignal(symbol, timeframe = '15m') {
    try {
      // 1. 获取历史数据
      const candles = await this.client.getCandles(symbol, timeframe, 200);
      if (candles.length < 100) {
        return { action: 'hold', confidence: 0, reason: 'insufficient_data' };
      }

      const closes = candles.map(c => c.close);
      const highs = candles.map(c => c.high);
      const lows = candles.map(c => c.low);
      const volumes = candles.map(c => c.volume);

      // 2. 计算技术指标
      const macd = this.indicators.macd(closes, this.config.macdFast, this.config.macdSlow, this.config.macdSignal);
      const rsi = this.indicators.rsi(closes, this.config.rsiPeriod);
      const kdj = this.indicators.kdj(highs, lows, closes, this.config.kdjPeriod);
      const bb = this.indicators.bollingerBands(closes, this.config.bbPeriod, this.config.bbStdDev);
      const atr = this.indicators.atr(highs, lows, closes, this.config.atrPeriod);
      const mas = this.indicators.movingAverages(closes, [5, 10, 20, 50, 100]);

      // 3. 获取实时数据
      const ticker = await this.client.getTicker(symbol);
      const orderBook = await this.client.getOrderBook(symbol, 10);
      const fundingRate = await this.client.getFundingRate(symbol);

      // 4. 分析信号
      const signals = this.analyzeSignals({
        closes,
        ticker,
        orderBook,
        fundingRate,
        macd,
        rsi,
        kdj,
        bb,
        atr,
        mas,
        candles,
      });

      // 5. 融合信号
      const finalSignal = this.fuseSignals(signals);

      // 6. 计算仓位大小
      const positionSize = this.calculatePositionSize(finalSignal, ticker.last, atr[atr.length - 1] || 0);

      return {
        symbol,
        action: finalSignal.action,
        confidence: finalSignal.confidence,
        reason: finalSignal.reason,
        positionSize,
        stopLoss: finalSignal.stopLoss,
        takeProfit: finalSignal.takeProfit,
        leverage: finalSignal.leverage,
        timestamp: Date.now(),
        indicators: {
          macd: macd.macd[macd.macd.length - 1],
          rsi: rsi[rsi.length - 1],
          kdj: { k: kdj.k[kdj.k.length - 1], d: kdj.d[kdj.d.length - 1] },
          bb: bb[bb.length - 1],
          atr: atr[atr.length - 1],
        },
      };
    } catch (err) {
      console.error(`Strategy error for ${symbol}:`, err.message);
      return { action: 'hold', confidence: 0, reason: 'error', error: err.message };
    }
  }

  /**
   * 分析各指标信号
   */
  analyzeSignals(data) {
    const signals = [];
    const { closes, ticker, macd, rsi, kdj, bb, atr, mas, fundingRate } = data;

    const currentPrice = ticker.last;
    const latestRsi = rsi[rsi.length - 1];
    const latestMacd = macd.macd[macd.macd.length - 1];
    const latestSignal = macd.signal[macd.signal.length - 1];
    const latestK = kdj.k[kdj.k.length - 1];
    const latestD = kdj.d[kdj.d.length - 1];
    const latestBb = bb[bb.length - 1];
    const latestAtr = atr[atr.length - 1];

    // 1. MACD 金叉/死叉
    const macdCross = TechnicalIndicators.cross(macd.macd, macd.signal);
    if (macdCross) {
      signals.push({
        type: 'macd',
        action: macdCross.type === 'golden' ? 'buy' : 'sell',
        confidence: 0.6 + Math.min(macdCross.strength * 10, 0.2),
        reason: `MACD ${macdCross.type}`,
      });
    }

    // 2. RSI 超买超卖
    const rsiStatus = TechnicalIndicators.overboughtOversold(latestRsi, this.config.rsiOverbought, this.config.rsiOversold);
    if (rsiStatus === 'oversold') {
      signals.push({ type: 'rsi', action: 'buy', confidence: 0.55, reason: 'RSI oversold' });
    } else if (rsiStatus === 'overbought') {
      signals.push({ type: 'rsi', action: 'sell', confidence: 0.55, reason: 'RSI overbought' });
    }

    // 3. KDJ 金叉死叉
    const kdjCross = TechnicalIndicators.cross(kdj.k, kdj.d);
    if (kdjCross) {
      signals.push({
        type: 'kdj',
        action: kdjCross.type === 'golden' ? 'buy' : 'sell',
        confidence: 0.5 + Math.min(kdjCross.strength * 5, 0.3),
        reason: `KDJ ${kdjCross.type}`,
      });
    }

    // 4. 布林带突破
    const bbBreakout = TechnicalIndicators.breakout(
      currentPrice,
      latestBb.upper,
      latestBb.lower,
      bb.length > 1 ? bb[bb.length - 2].upper : null,
      bb.length > 1 ? bb[bb.length - 2].lower : null
    );
    if (bbBreakout === 'upper_breakout') {
      signals.push({ type: 'bollinger', action: 'sell', confidence: 0.6, reason: 'Bollinger upper breakout' });
    } else if (bbBreakout === 'lower_breakout') {
      signals.push({ type: 'bollinger', action: 'buy', confidence: 0.6, reason: 'Bollinger lower breakout' });
    }

    // 5. 均线系统
    const ma5 = mas.ma5 ? mas.ma5[mas.ma5.length - 1] : currentPrice;
    const ma20 = mas.ma20 ? mas.ma20[mas.ma20.length - 1] : currentPrice;
    const ma50 = mas.ma50 ? mas.ma50[mas.ma50.length - 1] : currentPrice;

    if (ma5 > ma20 && ma20 > ma50 && currentPrice > ma5) {
      signals.push({ type: 'ma', action: 'buy', confidence: 0.65, reason: 'MA alignment bullish' });
    } else if (ma5 < ma20 && ma20 < ma50 && currentPrice < ma5) {
      signals.push({ type: 'ma', action: 'sell', confidence: 0.65, reason: 'MA alignment bearish' });
    }

    // 6. 资金费率 (如果过高，空头信号)
    if (fundingRate && parseFloat(fundingRate.fundingRate) > this.config.fundingRateThreshold) {
      signals.push({ type: 'funding', action: 'sell', confidence: 0.5, reason: 'High funding rate (pay long)' });
    } else if (fundingRate && parseFloat(fundingRate.fundingRate) < -this.config.fundingRateThreshold) {
      signals.push({ type: 'funding', action: 'buy', confidence: 0.5, reason: 'Negative funding rate (pay short)' });
    }

    // 7. 成交量确认
    const volumeAvg = volumes.slice(-20).reduce((a, b) => a + b, 0) / 20;
    const currentVolume = volumes[volumes.length - 1];
    const volumeRatio = currentVolume / volumeAvg;
    if (volumeRatio < 0.5) {
      // 成交量不足，降低所有信号置信度
      signals.forEach(s => s.confidence *= 0.7);
    } else if (volumeRatio > 1.5) {
      signals.forEach(s => s.confidence *= 1.2);
    }

    // 8. ATR 动态止损止盈
    const atrMultiplier = this.config.stopLossAtrMultiplier;
    const stopLossDistance = latestAtr * atrMultiplier;
    const takeProfitDistance = latestAtr * this.config.takeProfitAtrMultiplier;

    return { signals, stopLossDistance, takeProfitDistance, latestAtr };
  }

  /**
   * 融合所有信号
   */
  fuseSignals(analysis) {
    const { signals, stopLossDistance, takeProfitDistance } = analysis;

    if (signals.length === 0) {
      return { action: 'hold', confidence: 0, reason: 'no_signals' };
    }

    // 按动作分组计算加权置信度
    const groups = { buy: 0, sell: 0, hold: 0 };
    let totalConfidence = 0;

    for (const signal of signals) {
      groups[signal.action] += signal.confidence;
      totalConfidence += signal.confidence;
    }

    // 找出主要动作
    let bestAction = 'hold';
    let bestScore = groups.hold;

    if (groups.buy > bestScore && groups.buy / totalConfidence > 0.4) {
      bestAction = 'buy';
      bestScore = groups.buy;
    }
    if (groups.sell > bestScore && groups.sell / totalConfidence > 0.4) {
      bestAction = 'sell';
      bestScore = groups.sell;
    }

    const confidence = totalConfidence > 0 ? bestScore / totalConfidence : 0;

    // 计算止损止盈价格
    const currentPrice = signals.length > 0 ? signals[0].currentPrice || 0 : 0;
    let stopLoss = null;
    let takeProfit = null;

    if (bestAction === 'buy' && currentPrice > 0) {
      stopLoss = currentPrice - stopLossDistance;
      takeProfit = currentPrice + takeProfitDistance;
    } else if (bestAction === 'sell' && currentPrice > 0) {
      stopLoss = currentPrice + stopLossDistance;
      takeProfit = currentPrice - takeProfitDistance;
    }

    // 理由汇总
    const reasons = signals.filter(s => s.action === bestAction).map(s => s.reason);

    return {
      action: confidence > this.config.minConfidence ? bestAction : 'hold',
      confidence,
      reason: reasons.join(', '),
      stopLoss,
      takeProfit,
      leverage: this.config.maxLeverage,
    };
  }

  /**
   * 计算仓位大小 (凯利公式 + 风险控制)
   */
  calculatePositionSize(signal, currentPrice, atr) {
    if (signal.action === 'hold') return 0;

    // 基于ATR的风险金额
    const riskPerContract = atr * this.config.stopLossAtrMultiplier;
    if (riskPerContract === 0) return 0;

    // 总资金 (从配置读取或默认)
    const totalCapital = 10000; // TODO: 从账户余额获取

    // 凯利比例 (简化: 胜率*赔率 - (1-胜率))
    const winRate = 0.55; // 假设55%胜率，实际应从历史数据计算
    const payoffRatio = (signal.takeProfit - currentPrice) / (currentPrice - signal.stopLoss);
    const kellyFraction = (winRate * payoffRatio - (1 - winRate)) / payoffRatio;
    const safeFraction = Math.min(kellyFraction * 0.5, 0.25); // 半凯利，最大25%

    const positionValue = totalCapital * safeFraction;

    // 转换为张数 (合约面值)
    const contractValue = currentPrice; // 简化: 1张 = 1个币
    const contracts = Math.floor(positionValue / contractValue);

    return Math.min(contracts, this.config.maxPositionSize / currentPrice);
  }

  /**
   * 获取策略表现
   */
  getPerformance() {
    return {
      name: 'HighWinrateStrategy',
      type: 'technical',
      indicators: ['MACD', 'RSI', 'KDJ', 'Bollinger', 'MA', 'ATR', 'FundingRate'],
      config: this.config,
    };
  }
}

module.exports = HighWinrateStrategy;