/**
 * 信号融合引擎
 * 融合多个策略信号，生成最终交易决策
 */

class SignalFusionEngine {
  constructor() {
    this.strategies = new Map();
    this.weights = new Map();
    this.history = [];
  }

  /**
   * 注册策略
   */
  registerStrategy(name, weight = 1.0) {
    this.strategies.set(name, {
      name,
      weight,
      recentSignals: [],
      winRate: 0.5,
      profitFactor: 1.0,
      sharpeRatio: 0,
    });
    this.weights.set(name, weight);
  }

  /**
   * 接收策略信号
   * @param {string} strategyName
   * @param {Object} signal - { action: 'buy'|'sell'|'hold', confidence: 0-1, params: {} }
   * @param {Object} context - 市场上下文
   */
  receiveSignal(strategyName, signal, context) {
    if (!this.strategies.has(strategyName)) {
      console.warn(`Strategy ${strategyName} not registered, ignoring signal`);
      return;
    }

    const strategy = this.strategies.get(strategyName);
    strategy.recentSignals.push({
      signal,
      context,
      timestamp: Date.now(),
    });

    // 保留最近100个信号
    if (strategy.recentSignals.length > 100) {
      strategy.recentSignals = strategy.recentSignals.slice(-100);
    }
  }

  /**
   * 评估各策略表现 (基于历史信号和实际结果)
   */
  evaluateStrategies(tradeResults) {
    for (const [name, strategy] of this.strategies) {
      const strategyResults = tradeResults.filter(r => r.strategy === name);
      if (strategyResults.length > 0) {
        const wins = strategyResults.filter(r => r.profit > 0).length;
        const total = strategyResults.length;
        strategy.winRate = wins / total;

        const grossProfit = strategyResults.filter(r => r.profit > 0).reduce((sum, r) => sum + r.profit, 0);
        const grossLoss = Math.abs(strategyResults.filter(r => r.profit < 0).reduce((sum, r) => sum + r.profit, 0));
        strategy.profitFactor = grossLoss > 0 ? grossProfit / grossLoss : 1.0;

        // 计算夏普比率 (简化)
        const returns = strategyResults.map(r => r.profit / r.risk);
        const avgReturn = returns.reduce((a, b) => a + b, 0) / returns.length;
        const stdDev = Math.sqrt(returns.reduce((sum, r) => sum + Math.pow(r - avgReturn, 2), 0) / returns.length);
        strategy.sharpeRatio = stdDev > 0 ? avgReturn / stdDev : 0;
      }
    }
  }

  /**
   * 动态调整策略权重
   */
  adjustWeights() {
    for (const [name, strategy] of this.strategies) {
      // 基于表现调整权重
      const performanceScore =
        strategy.winRate * 0.4 +
        Math.min(strategy.profitFactor, 3) * 0.4 +
        Math.max(strategy.sharpeRatio, 0) * 0.2;

      const baseWeight = this.weights.get(name);
      const newWeight = baseWeight * (0.5 + performanceScore); // 0.5~1.5倍调整

      this.weights.set(name, Math.max(0.1, Math.min(5.0, newWeight)));
    }
  }

  /**
   * 生成最终信号 (加权投票)
   */
  fuseSignals(context) {
    const votes = {
      buy: 0,
      sell: 0,
      hold: 0,
    };

    let totalWeight = 0;
    const strategyContributions = [];

    for (const [name, strategy] of this.strategies) {
      const weight = this.weights.get(name);
      totalWeight += weight;

      // 获取该策略的最新信号
      const latestSignal = strategy.recentSignals.length > 0
        ? strategy.recentSignals[strategy.recentSignals.length - 1].signal
        : { action: 'hold', confidence: 0.5 };

      // 加权投票
      const weightedConfidence = latestSignal.confidence * weight;
      votes[latestSignal.action] += weightedConfidence;

      strategyContributions.push({
        strategy: name,
        weight,
        action: latestSignal.action,
        confidence: latestSignal.confidence,
        weighted: weightedConfidence,
      });
    }

    // 归一化
    for (const action in votes) {
      votes[action] = totalWeight > 0 ? votes[action] / totalWeight : 0;
    }

    // 确定最终动作
    let finalAction = 'hold';
    let maxVote = votes.hold;

    if (votes.buy > maxVote && votes.buy > 0.5) {
      finalAction = 'buy';
      maxVote = votes.buy;
    } else if (votes.sell > maxVote && votes.sell > 0.5) {
      finalAction = 'sell';
      maxVote = votes.sell;
    }

    // 计算综合置信度
    const confidence = maxVote;

    // 市场状态分析
    const marketRegime = this.detectMarketRegime(context);

    return {
      action: finalAction,
      confidence,
      votes,
      marketRegime,
      contributions: strategyContributions,
      timestamp: Date.now(),
    };
  }

  /**
   * 检测市场状态 (趋势/震荡/高波动)
   */
  detectMarketRegime(context) {
    const { volatility, trendStrength, volumeRatio } = context;

    if (volatility > 0.02) {
      return 'high_volatility';
    }
    if (trendStrength > 0.7) {
      return 'trending';
    }
    if (volumeRatio > 1.5) {
      return 'high_volume';
    }
    return 'ranging';
  }

  /**
   * 获取策略表现排名
   */
  getStrategyRanking() {
    return Array.from(this.strategies.values())
      .map(s => ({
        name: s.name,
        weight: this.weights.get(s.name),
        winRate: s.winRate,
        profitFactor: s.profitFactor,
        sharpeRatio: s.sharpeRatio,
        performanceScore: s.winRate * 0.4 + Math.min(s.profitFactor, 3) * 0.4 + Math.max(s.sharpeRatio, 0) * 0.2,
      }))
      .sort((a, b) => b.performanceScore - a.performanceScore);
  }

  /**
   * 获取融合统计
   */
  getStats() {
    return {
      totalStrategies: this.strategies.size,
      weights: Object.fromEntries(this.weights),
      recentDecisions: this.history.slice(-10),
      ranking: this.getStrategyRanking(),
    };
  }
}

module.exports = SignalFusionEngine;