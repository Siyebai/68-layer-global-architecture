/**
 * 技术指标库
 * 包含: MACD, RSI, KDJ, 布林带, ATR, 成交量指标, 均线系统
 */

class TechnicalIndicators {
  /**
   * 计算 SMA (简单移动平均)
   */
  static sma(data, period = 20) {
    if (data.length < period) return [];
    const result = [];
    for (let i = period - 1; i < data.length; i++) {
      const slice = data.slice(i - period + 1, i + 1);
      const sum = slice.reduce((a, b) => a + b, 0);
      result.push(sum / period);
    }
    return result;
  }

  /**
   * 计算 EMA (指数移动平均)
   */
  static ema(data, period = 20) {
    if (data.length < period) return [];
    const multiplier = 2 / (period + 1);
    const result = [];
    let prevEma = data.slice(0, period).reduce((a, b) => a + b, 0) / period;
    result.push(prevEma);

    for (let i = period; i < data.length; i++) {
      const ema = (data[i] - prevEma) * multiplier + prevEma;
      result.push(ema);
      prevEma = ema;
    }
    return result;
  }

  /**
   * MACD 指数平滑移动平均线
   * @returns {Object} { macd, signal, histogram }
   */
  static macd(closePrices, fast = 12, slow = 26, signal = 9) {
    const fastEma = this.ema(closePrices, fast);
    const slowEma = this.ema(closePrices, slow);

    // MACD线 = 快线 - 慢线
    const macd = fastEma.map((val, i) => val - slowEma[i]);

    // 信号线 = MACD的EMA
    const signalLine = this.ema(macd, signal);

    // 柱状图 = MACD - 信号线
    const histogram = macd.map((val, i) => val - signalLine[i]);

    return {
      macd,
      signal: signalLine,
      histogram,
    };
  }

  /**
   * RSI 相对强弱指数
   */
  static rsi(closePrices, period = 14) {
    if (closePrices.length < period + 1) return [];

    const changes = [];
    for (let i = 1; i < closePrices.length; i++) {
      changes.push(closePrices[i] - closePrices[i - 1]);
    }

    const gains = changes.map(c => c > 0 ? c : 0);
    const losses = changes.map(c => c < 0 ? -c : 0);

    const avgGain = gains.slice(0, period).reduce((a, b) => a + b, 0) / period;
    const avgLoss = losses.slice(0, period).reduce((a, b) => a + b, 0) / period;

    const rs = avgLoss === 0 ? 100 : avgGain / avgLoss;
    const rsi = [100 - (100 / (1 + rs))];

    for (let i = period; i < changes.length; i++) {
      const gain = gains[i];
      const loss = losses[i];
      const newAvgGain = (avgGain * (period - 1) + gain) / period;
      const newAvgLoss = (avgLoss * (period - 1) + loss) / period;
      const newRs = newAvgLoss === 0 ? 100 : newAvgGain / newAvgLoss;
      rsi.push(100 - (100 / (1 + newRs)));
      avgGain = newAvgGain;
      avgLoss = newAvgLoss;
    }

    return rsi;
  }

  /**
   * KDJ 随机指标
   */
  static kdj(highPrices, lowPrices, closePrices, period = 14, kPeriod = 3, dPeriod = 3) {
    if (highPrices.length < period) return { k: [], d: [], j: [] };

    const k = [];
    const d = [];
    const j = [];

    for (let i = period - 1; i < closePrices.length; i++) {
      const high = Math.max(...highPrices.slice(i - period + 1, i + 1));
      const low = Math.min(...lowPrices.slice(i - period + 1, i + 1));
      const close = closePrices[i];
      const rsv = (close - low) / (high - low) * 100;

      const prevK = k.length ? k[k.length - 1] : 50;
      const prevD = d.length ? d[d.length - 1] : 50;
      const currK = (prevK * (kPeriod - 1) + rsv) / kPeriod;
      const currD = (prevD * (dPeriod - 1) + currK) / dPeriod;

      k.push(currK);
      d.push(currD);
      j.push(3 * currK - 2 * currD);
    }

    return { k, d, j };
  }

  /**
   * 布林带 (Bollinger Bands)
   */
  static bollingerBands(closePrices, period = 20, stdDev = 2) {
    const middle = this.sma(closePrices, period);
    const bands = [];

    for (let i = period - 1; i < closePrices.length; i++) {
      const slice = closePrices.slice(i - period + 1, i + 1);
      const mean = middle[i - period + 1];
      const variance = slice.reduce((sum, price) => sum + Math.pow(price - mean, 2), 0) / period;
      const std = Math.sqrt(variance);
      bands.push({
        upper: mean + stdDev * std,
        middle: mean,
        lower: mean - stdDev * std,
      });
    }

    return bands;
  }

  /**
   * ATR 真实波幅均值
   */
  static atr(highPrices, lowPrices, closePrices, period = 14) {
    if (highPrices.length < period) return [];

    const trueRanges = [];
    for (let i = 0; i < highPrices.length; i++) {
      const high = highPrices[i];
      const low = lowPrices[i];
      const prevClose = i > 0 ? closePrices[i - 1] : closePrices[i];

      const tr = Math.max(
        high - low,
        Math.abs(high - prevClose),
        Math.abs(low - prevClose)
      );
      trueRanges.push(tr);
    }

    // 计算 ATR (简单移动平均)
    const atr = [];
    for (let i = period - 1; i < trueRanges.length; i++) {
      const slice = trueRanges.slice(i - period + 1, i + 1);
      const avg = slice.reduce((a, b) => a + b, 0) / period;
      atr.push(avg);
    }

    return atr;
  }

  /**
   * 成交量加权平均价 (VWAP)
   */
  static vwap(highPrices, lowPrices, closePrices, volumes, period = 20) {
    if (closePrices.length < period) return [];

    const vwaps = [];
    for (let i = period - 1; i < closePrices.length; i++) {
      let sumPv = 0;
      let sumV = 0;
      for (let j = i - period + 1; j <= i; j++) {
        const typicalPrice = (highPrices[j] + lowPrices[j] + closePrices[j]) / 3;
        sumPv += typicalPrice * volumes[j];
        sumV += volumes[j];
      }
      vwaps.push(sumV === 0 ? 0 : sumPv / sumV);
    }
    return vwaps;
  }

  /**
   * 均线系统 (多周期)
   */
  static movingAverages(closePrices, periods = [5, 10, 20, 50, 100, 200]) {
    const result = {};
    for (const period of periods) {
      if (closePrices.length >= period) {
        result[`ma${period}`] = this.sma(closePrices, period);
      }
    }
    return result;
  }

  /**
   * 判断金叉/死叉
   */
  static cross(series1, series2, offset = 0) {
    if (series1.length < 2 || series2.length < 2) return null;

    const prev1 = series1[series1.length - 2];
    const curr1 = series1[series1.length - 1];
    const prev2 = series2[series2.length - 2];
    const curr2 = series2[series2.length - 1];

    if (prev1 <= prev2 && curr1 > curr2) {
      return { type: 'golden', strength: (curr1 - curr2) / curr2 };
    }
    if (prev1 >= prev2 && curr1 < curr2) {
      return { type: 'death', strength: (curr2 - curr1) / curr1 };
    }
    return null;
  }

  /**
   * 判断超买/超卖 (RSI)
   */
  static overboughtOversold(rsiValue, overbought = 70, oversold = 30) {
    if (rsiValue >= overbought) return 'overbought';
    if (rsiValue <= oversold) return 'oversold';
    return 'neutral';
  }

  /**
   * 计算布林带宽度 (波动率)
   */
  static bollingerWidth(bands) {
    if (bands.length === 0) return 0;
    const latest = bands[bands.length - 1];
    return (latest.upper - latest.lower) / latest.middle;
  }

  /**
   * 检测价格突破
   */
  static breakout(price, upperBand, lowerBand, previousUpper, previousLower) {
    if (!previousUpper || !previousLower) return 'none';

    if (price > upperBand && previousUpper && price <= previousUpper) {
      return 'upper_breakout';
    }
    if (price < lowerBand && previousLower && price >= previousLower) {
      return 'lower_breakout';
    }
    return 'none';
  }

  /**
   * 计算趋势强度 (ADX 简化版)
   */
  static trendStrength(highPrices, lowPrices, closePrices, period = 14) {
    const atr = this.atr(highPrices, lowPrices, closePrices, period);
    if (atr.length === 0) return 0;

    // 简化的趋势强度: 价格变化与ATR的比例
    const priceChange = Math.abs(closePrices[closePrices.length - 1] - closePrices[closePrices.length - period]);
    return priceChange / (atr[atr.length - 1] * period);
  }
}

module.exports = TechnicalIndicators;