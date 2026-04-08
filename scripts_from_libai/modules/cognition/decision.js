#!/usr/bin/env node
// 决策模块 (Decision Module) - 五层系统 cognition 层核心
// 提供多准则决策、博弈论、贝叶斯推理、强化学习决策能力

const logger = require('../../utils/logger');

class DecisionModule {
  constructor(config = {}) {
    this.config = {
      enableNash: true,
      enableBayesian: true,
      enableQLearning: true,
      enableMCDA: true,
      ...config
    };
    this.initialized = false;
    this.metrics = {
      decisionsMade: 0,
      nashSolved: 0,
      bayesianInferences: 0,
      qLearningDecisions: 0,
      avgDecisionTime: 0
    };
  }

  async initialize() {
    if (this.initialized) return;
    logger.info('[Decision] 初始化决策模块...');
    
    // 初始化决策配置
    this.decisionHistory = [];
    this.qTables = new Map(); // 存储Q表
    
    this.initialized = true;
    logger.info('[Decision] 决策模块已就绪');
  }

  // ========== 主决策入口 ==========

  /**
   * 核心决策函数 - 根据上下文选择最优方案
   * @param {Array} options - 候选方案列表
   * @param {Object} context - 决策上下文 (环境、约束等)
   * @returns {Object} 决策结果
   */
  async decide(options, context = {}) {
    const start = Date.now();
    
    try {
      this.metrics.decisionsMade++;
      
      // 1. 分析决策类型
      const decisionType = this.classifyDecisionType(options, context);
      
      // 2. 选择决策策略
      let bestOption;
      switch (decisionType) {
        case 'multi_criteria':
          bestOption = await this.multiCriteriaDecision(options, context.criteria, context.weights);
          break;
        case 'strategic':
          bestOption = await this.gameTheoreticDecision(options, context);
          break;
        case 'uncertain':
          bestOption = await this.bayesianDecision(options, context);
          break;
        case 'sequential':
          bestOption = await this.reinforcementDecision(options, context);
          break;
        default:
          bestOption = this.simpleScoreDecision(options, context);
      }
      
      // 3. 记录决策
      this.recordDecision(bestOption, decisionType, context);
      
      const duration = Date.now() - start;
      this.updateMetrics(duration);
      
      return {
        success: true,
        option: bestOption,
        type: decisionType,
        confidence: bestOption.score || 0.8,
        metrics: { ...this.metrics }
      };
      
    } catch (err) {
      logger.error('[Decision] 决策失败:', err.message);
      return {
        success: false,
        error: err.message,
        fallback: options[0] // 降级到第一个选项
      };
    }
  }

  // ========== 多准则决策分析 (MCDA) ==========

  /**
   * 多准则决策分析 - 加权评分法
   * @param {Array} options - 候选方案 [{id, name, scores: {criteria: value}}]
   * @param {Array} criteria - 准则列表 [{name, weight, direction: 'max'|'min'}]
   * @param {Object} weights - 准则权重 {criterionName: weight}
   */
  async multiCriteriaDecision(options, criteria, weights) {
    if (!criteria || !weights) {
      throw new Error('MCDA需要criteria和weights参数');
    }

    // 标准化评分
    const normalizedOptions = options.map(opt => {
      let totalScore = 0;
      
      for (const criterion of criteria) {
        const value = opt.scores[criterion.name];
        const weight = weights[criterion.name] || 0;
        
        // 获取所有选项在该准则上的值进行标准化
        const allValues = options.map(o => o.scores[criterion.name]);
        const min = Math.min(...allValues);
        const max = Math.max(...allValues);
        const range = max - min || 1;
        
        // Min-Max标准化
        let normalized;
        if (criterion.direction === 'min') {
          normalized = (max - value) / range; // 最小值最优
        } else {
          normalized = (value - min) / range; // 最大值最优
        }
        
        totalScore += normalized * weight;
      }
      
      return { ...opt, mcdaScore: totalScore };
    });

    // 选择最高分
    normalizedOptions.sort((a, b) => b.mcdaScore - a.mcdaScore);
    const best = normalizedOptions[0];
    
    logger.debug(`[MCDA] 最优方案: ${best.name} (得分: ${best.mcdaScore.toFixed(4)})`);
    
    return {
      ...best,
      score: best.mcdaScore,
      method: 'mcda'
    };
  }

  // ========== 博弈论决策 ==========

  /**
   * 纳什均衡求解 (2人博弈)
   * @param {Array} payoffMatrix - 收益矩阵 [[玩家1收益, 玩家2收益], ...]
   * @param {Array} strategies - 策略组合
   */
  async nashEquilibrium(payoffMatrix, strategies = null) {
    const start = Date.now();
    
    try {
      // 简化实现: 寻找占优策略均衡
      const n = Math.sqrt(payoffMatrix.length); // 假设对称博弈
      const equilibria = [];
      
      // 检查纯策略纳什均衡
      for (let i = 0; i < payoffMatrix.length; i++) {
        const isNash = this.checkPureStrategyNash(i, payoffMatrix, n);
        if (isNash) {
          equilibria.push({
            strategy: Math.floor(i / n),
            opponent: i % n,
            type: 'pure'
          });
        }
      }
      
      // 如果没有纯策略均衡，使用混合策略 (简化)
      if (equilibria.length === 0) {
        const mixed = this.computeMixedStrategy(payoffMatrix);
        equilibria.push(mixed);
      }
      
      this.metrics.nashSolved++;
      const duration = Date.now() - start;
      logger.debug(`[Nash] 求解完成: ${equilibria.length} 个均衡, 耗时 ${duration}ms`);
      
      return {
        success: true,
        equilibria,
        count: equilibria.length,
        duration
      };
      
    } catch (err) {
      logger.error('[Nash] 求解失败:', err.message);
      return { success: false, error: err.message };
    }
  }

  checkPureStrategyNash(index, payoffMatrix, n) {
    const myStrategy = Math.floor(index / n);
    const oppStrategy = index % n;
    const myPayoff = payoffMatrix[index][0];
    
    // 检查是否是对手的最优反应
    for (let s = 0; s < n; s++) {
      const newIndex = s * n + oppStrategy;
      if (payoffMatrix[newIndex][1] > payoffMatrix[index][1]) {
        return false; // 对手有更好选择
      }
    }
    
    // 检查是否是我的最优反应
    for (let s = 0; s < n; s++) {
      const newIndex = myStrategy * n + s;
      if (payoffMatrix[newIndex][0] > myPayoff) {
        return false; // 我有更好选择
      }
    }
    
    return true;
  }

  computeMixedStrategy(payoffMatrix) {
    // 简化: 返回均匀混合策略
    return {
      strategy: 'mixed',
      probabilities: [0.5, 0.5],
      type: 'mixed',
      note: '简化实现，实际需解线性方程组'
    };
  }

  async gameTheoreticDecision(options, context) {
    // 基于博弈论的决策
    // 如果存在对手模型，使用纳什均衡
    if (context.opponentModel) {
      const nashResult = await this.nashEquilibrium(context.payoffMatrix);
      if (nashResult.success && nashResult.equilibria.length > 0) {
        const bestEquilibrium = nashResult.equilibria[0];
        return {
          ...options[bestEquilibrium.strategy],
          score: 0.9,
          method: 'nash_equilibrium',
          equilibrium: bestEquilibrium
        };
      }
    }
    
    // 否则降级到MCDA
    return await this.multiCriteriaDecision(options, context.criteria, context.weights);
  }

  // ========== 贝叶斯决策 ==========

  /**
   * 贝叶斯推理
   * @param {Object} evidence - 证据 {variable: value}
   * @param {Object} network - 贝叶斯网络 {nodes: [], edges: [], cpts: {}}
   * @param {String} queryVariable - 查询变量
   */
  async bayesianInference(evidence, network, queryVariable) {
    const start = Date.now();
    
    try {
      // 简化: 使用朴素贝叶斯假设
      const hypotheses = network.hypotheses || ['A', 'B', 'C'];
      const priors = network.priors || { A: 0.33, B: 0.33, C: 0.34 };
      
      // 计算后验概率 (简化)
      const posteriors = {};
      let maxProb = 0;
      let bestHypothesis = null;
      
      for (const hyp of hypotheses) {
        let likelihood = 1;
        for (const [evVar, evVal] of Object.entries(evidence)) {
          likelihood *= this.getLikelihood(hyp, evVar, evVal, network);
        }
        posteriors[hyp] = priors[hyp] * likelihood;
        
        if (posteriors[hyp] > maxProb) {
          maxProb = posteriors[hyp];
          bestHypothesis = hyp;
        }
      }
      
      // 归一化
      const total = Object.values(posteriors).reduce((a, b) => a + b, 0);
      for (const hyp in posteriors) {
        posteriors[hyp] /= total;
      }
      
      this.metrics.bayesianInferences++;
      const duration = Date.now() - start;
      
      logger.debug(`[Bayesian] 推理完成: ${bestHypothesis} (概率: ${posteriors[bestHypothesis].toFixed(4)})`);
      
      return {
        success: true,
        hypothesis: bestHypothesis,
        probabilities: posteriors,
        confidence: posteriors[bestHypothesis],
        duration
      };
      
    } catch (err) {
      logger.error('[Bayesian] 推理失败:', err.message);
      return { success: false, error: err.message };
    }
  }

  getLikelihood(hypothesis, variable, value, network) {
    // 简化: 返回固定概率
    return 0.8;
  }

  async bayesianDecision(options, context) {
    // 使用贝叶斯推理辅助决策
    const evidence = context.evidence || {};
    const network = context.bayesianNetwork || { hypotheses: ['good', 'bad'], priors: { good: 0.6, bad: 0.4 } };
    
    const inference = await this.bayesianInference(evidence, network, 'outcome');
    
    if (inference.success) {
      // 根据后验概率调整选项评分
      const adjustedOptions = options.map(opt => ({
        ...opt,
        score: (opt.baseScore || 0.5) * (inference.hypothesis === 'good' ? 1.2 : 0.8)
      }));
      
      adjustedOptions.sort((a, b) => b.score - a.score);
      return {
        ...adjustedOptions[0],
        method: 'bayesian',
        bayesianConfidence: inference.confidence
      };
    }
    
    return this.simpleScoreDecision(options, context);
  }

  // ========== 强化学习决策 ==========

  /**
   * Q-Learning决策
   * @param {String} state - 当前状态
   * @param {Object} qTable - Q表 {state: {action: value}}
   */
  async qLearningDecision(state, qTable = null) {
    const start = Date.now();
    
    try {
      // 使用全局Q表或传入的Q表
      const table = qTable || this.qTables.get('global') || {};
      
      if (!table[state]) {
        // 新状态，随机选择
        const actions = Object.keys(table);
        if (actions.length === 0) return { action: 'explore', score: 0.5 };
        
        // 探索: 随机选择
        const randomAction = actions[Math.floor(Math.random() * actions.length)];
        return {
          action: randomAction,
          score: table[randomAction] || 0,
          method: 'qlearning_explore'
        };
      }
      
      // 利用: 选择Q值最大的动作
      const stateValues = table[state];
      let bestAction = null;
      let maxValue = -Infinity;
      
      for (const [action, value] of Object.entries(stateValues)) {
        if (value > maxValue) {
          maxValue = value;
          bestAction = action;
        }
      }
      
      this.metrics.qLearningDecisions++;
      const duration = Date.now() - start;
      
      return {
        success: true,
        action: bestAction,
        score: maxValue,
        method: 'qlearning_exploit',
        duration
      };
      
    } catch (err) {
      logger.error('[QLearning] 决策失败:', err.message);
      return { success: false, error: err.message };
    }
  }

  async reinforcementDecision(options, context) {
    const state = context.state || 'default';
    const qResult = await this.qLearningDecision(state);
    
    if (qResult.success) {
      // 找到对应的选项
      const matchingOption = options.find(opt => opt.action === qResult.action) || options[0];
      return {
        ...matchingOption,
        score: qResult.score,
        method: 'qlearning',
        qValue: qResult.score
      };
    }
    
    return this.simpleScoreDecision(options, context);
  }

  // ========== 辅助函数 ==========

  classifyDecisionType(options, context) {
    if (context.criteria && context.weights) return 'multi_criteria';
    if (context.opponentModel) return 'strategic';
    if (context.evidence || context.bayesianNetwork) return 'uncertain';
    if (context.state || context.sequential) return 'sequential';
    return 'simple';
  }

  simpleScoreDecision(options, context) {
    // 简单评分法: 基于context中的score字段
    const scored = options.map(opt => ({
      ...opt,
      score: opt.score || (opt.value ? opt.value / 100 : 0.5)
    }));
    
    scored.sort((a, b) => b.score - a.score);
    const best = scored[0];
    
    return {
      ...best,
      method: 'simple_score'
    };
  }

  recordDecision(decision, type, context) {
    this.decisionHistory.push({
      timestamp: Date.now(),
      type,
      decision,
      context: JSON.stringify(context).substring(0, 200)
    });
    
    // 保留最近1000条
    if (this.decisionHistory.length > 1000) {
      this.decisionHistory = this.decisionHistory.slice(-500);
    }
  }

  updateMetrics(duration) {
    const prevAvg = this.metrics.avgDecisionTime;
    const count = this.metrics.decisionsMade;
    this.metrics.avgDecisionTime = (prevAvg * (count - 1) + duration) / count;
  }

  // ========== 公共接口 ==========

  /**
   * 获取决策统计
   */
  async getMetrics() {
    return {
      ...this.metrics,
      historySize: this.decisionHistory.length,
      qTablesCount: this.qTables.size,
      uptime: Date.now() - (this.startTime || Date.now())
    };
  }

  /**
   * 清空决策历史
   */
  async clearHistory() {
    this.decisionHistory = [];
    this.qTables.clear();
    return { success: true, message: '决策历史已清空' };
  }

  /**
   * 保存/加载Q表
   */
  async saveQTable(name, qTable) {
    this.qTables.set(name, qTable);
    return { success: true, size: Object.keys(qTable).length };
  }

  async loadQTable(name) {
    return this.qTables.get(name) || null;
  }
}

module.exports = { DecisionModule };
