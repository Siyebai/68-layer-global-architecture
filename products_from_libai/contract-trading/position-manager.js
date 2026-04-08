/**
 * 合约交易仓位管理器
 * 支持逐仓/全仓、杠杆计算、强平监控
 */

const Redis = require('ioredis');

class PositionManager {
  constructor(redisConfig = {}) {
    if (redisConfig.client) {
      this.redis = redisConfig.client;
    } else {
      this.redis = new Redis({
        host: redisConfig.host || 'localhost',
        port: redisConfig.port || 6379,
        password: redisConfig.password,
      });
    }

    this.prefix = 'contract:position';
  }

  /**
   * 开仓 (增加仓位)
   * @param {string} symbol - 交易对 (e.g., 'BTC-USDT-SWAP')
   * @param {string} side - 'long' | 'short'
   * @param {number} size - 数量 (张数或币数)
   * @param {number} price - 开仓价格
   * @param {number} leverage - 杠杆倍数 (默认10)
   * @param {string} mode - 'isolated' (逐仓) | 'cross' (全仓)
   */
  async openPosition(symbol, side, size, price, leverage = 10, mode = 'cross') {
    const positionKey = `${this.prefix}:${symbol}:${side}`;
    
    // 获取现有仓位
    const existing = await this.getPosition(symbol, side);
    
    // 计算新仓位平均价格
    const newSize = existing ? existing.size + size : size;
    const newAvgPrice = existing 
      ? (existing.size * existing.avgPrice + size * price) / newSize
      : price;

    // 计算保证金 (假设USDT本位)
    const notional = newSize * price; // 名义价值
    const margin = notional / leverage; // 所需保证金

    const position = {
      symbol,
      side,
      size: newSize,
      avgPrice: newAvgPrice,
      leverage,
      mode,
      margin,
      notional,
      unrealizedPnl: 0,
      liquidationPrice: await this.calculateLiquidationPrice(symbol, side, newAvgPrice, leverage, mode),
      updatedAt: Date.now(),
    };

    await this.redis.set(positionKey, JSON.stringify(position));
    await this.redis.expire(positionKey, 86400 * 30); // 30天过期

    return position;
  }

  /**
   * 平仓 (减少仓位)
   */
  async closePosition(symbol, side, size, price) {
    const positionKey = `${this.prefix}:${symbol}:${side}`;
    const existing = await this.getPosition(symbol, side);

    if (!existing) {
      throw new Error(`No position found for ${symbol} ${side}`);
    }

    if (size >= existing.size) {
      // 全部平仓
      const realizedPnl = this.calculateRealizedPnl(existing, price, size);
      await this.redis.del(positionKey);
      return { closed: true, realizedPnl, remainingSize: 0 };
    } else {
      // 部分平仓
      const remainingSize = existing.size - size;
      const realizedPnl = this.calculateRealizedPnl(existing, price, size);
      
      existing.size = remainingSize;
      existing.avgPrice = existing.avgPrice; // 平均价格不变 (FIFO)
      existing.notional = remainingSize * price;
      existing.margin = existing.notional / existing.leverage;
      existing.updatedAt = Date.now();
      existing.realizedPnl = (existing.realizedPnl || 0) + realizedPnl;

      await this.redis.set(positionKey, JSON.stringify(existing));
      return { closed: false, realizedPnl, remainingSize };
    }
  }

  /**
   * 获取当前仓位
   */
  async getPosition(symbol, side = null) {
    if (side) {
      const key = `${this.prefix}:${symbol}:${side}`;
      const data = await this.redis.get(key);
      return data ? JSON.parse(data) : null;
    } else {
      // 返回双向仓位
      const longKey = `${this.prefix}:${symbol}:long`;
      const shortKey = `${this.prefix}:${symbol}:short`;
      const [longData, shortData] = await Promise.all([
        this.redis.get(longKey),
        this.redis.get(shortKey),
      ]);

      return {
        long: longData ? JSON.parse(longData) : null,
        short: shortData ? JSON.parse(shortData) : null,
      };
    }
  }

  /**
   * 计算强平价格
   * 简化公式: 强平价 = 开仓价 × (1 ± 1/杠杆) (逐仓/全仓略有不同)
   */
  async calculateLiquidationPrice(symbol, side, entryPrice, leverage, mode) {
    // 假设维持保证金率 2% (OKX合约通常为0.5%-2%)
    const maintenanceMarginRate = 0.02;
    const avgConf = mode === 'isolated' ? 1 : 0.5;

    if (side === 'long') {
      // 多仓强平: 价格跌破 (开仓价 × (1 - 1/杠杆 - 维持保证金))
      return entryPrice * (1 - 1/leverage - maintenanceMarginRate);
    } else {
      // 空仓强平: 价格涨破 (开仓价 × (1 + 1/杠杆 + 维持保证金))
      return entryPrice * (1 + 1/leverage + maintenanceMarginRate);
    }
  }

  /**
   * 计算已实现盈亏
   */
  calculateRealizedPnl(position, closePrice, closeSize) {
    if (position.side === 'long') {
      return (closePrice - position.avgPrice) * closeSize;
    } else {
      return (position.avgPrice - closePrice) * closeSize;
    }
  }

  /**
   * 更新未实现盈亏 (需外部传入当前市价)
   */
  async updateUnrealizedPnl(symbol, currentPrice) {
    const positions = await this.getAllPositions(symbol);
    
    for (const pos of positions) {
      if (pos.side === 'long') {
        pos.unrealizedPnl = (currentPrice - pos.avgPrice) * pos.size;
      } else {
        pos.unrealizedPnl = (pos.avgPrice - currentPrice) * pos.size;
      }
      const key = `${this.prefix}:${symbol}:${pos.side}`;
      await this.redis.set(key, JSON.stringify(pos));
    }
  }

  /**
   * 获取所有仓位 (所有symbol)
   */
  async getAllPositions(symbol = null) {
    const pattern = symbol 
      ? `${this.prefix}:${symbol}:*`
      : `${this.prefix}:*`;
    
    const keys = await this.redis.keys(pattern);
    const positions = [];

    for (const key of keys) {
      const data = await this.redis.get(key);
      if (data) positions.push(JSON.parse(data));
    }

    return positions;
  }

  /**
   * 检查强平风险
   */
  async checkLiquidationRisk(symbol, currentPrice) {
    const positions = await this.getAllPositions(symbol);
    const atRisk = [];

    for (const pos of positions) {
      if (pos.side === 'long' && currentPrice <= pos.liquidationPrice) {
        atRisk.push({ ...pos, risk: 'LONG_LIQUIDATION', distance: currentPrice - pos.liquidationPrice });
      } else if (pos.side === 'short' && currentPrice >= pos.liquidationPrice) {
        atRisk.push({ ...pos, risk: 'SHORT_LIQUIDATION', distance: pos.liquidationPrice - currentPrice });
      }
    }

    return atRisk;
  }

  /**
   * 计算总保证金占用和总权益
   */
  async calculateAccountSummary() {
    const positions = await this.getAllPositions();
    
    let totalMargin = 0;
    let totalUnrealizedPnl = 0;
    let totalRealizedPnl = 0;

    for (const pos of positions) {
      totalMargin += pos.margin;
      totalUnrealizedPnl += pos.unrealizedPnl || 0;
      totalRealizedPnl += pos.realizedPnl || 0;
    }

    return {
      totalMargin,
      totalUnrealizedPnl,
      totalRealizedPnl,
      totalEquity: totalMargin + totalUnrealizedPnl + totalRealizedPnl,
      positionCount: positions.length,
    };
  }
}

module.exports = PositionManager;