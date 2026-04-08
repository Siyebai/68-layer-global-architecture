#!/usr/bin/env node
// 决策模块包装器 - 集成DecisionModule到五层系统

const { DecisionModule } = require('./modules/cognition/decision');

class AutonomousDecision {
  constructor(system) {
    this.system = system;
    this.decision = null;
    this.initialized = false;
  }

  async initialize() {
    if (this.initialized) return;
    
    console.log('[AutonomousDecision] 初始化决策模块...');
    this.decision = new DecisionModule();
    await this.decision.initialize();
    this.initialized = true;
    console.log('[AutonomousDecision] 决策模块已就绪');
  }

  start() {
    if (!this.initialized) {
      console.warn('[AutonomousDecision] 未初始化，跳过启动');
      return;
    }
    
    console.log('[AutonomousDecision] 决策引擎启动中...');
    
    // 定期决策周期 (每30秒)
    setInterval(() => {
      this.decisionCycle();
    }, 30 * 1000);
    
    console.log('[AutonomousDecision] ✅ 决策引擎已启动');
  }

  async decisionCycle() {
    try {
      // 获取当前系统状态作为决策上下文
      const context = this.buildDecisionContext();
      
      // 定义候选决策选项
      const options = this.generateOptions(context);
      
      // 执行决策
      const result = await this.decision.decide(options, context);
      
      if (result.success) {
        console.log(`[决策] ${result.type} 类型决策: ${result.option.name} (置信度: ${(result.confidence*100).toFixed(1)}%)`);
        
        // 执行决策
        await this.executeDecision(result.option);
      } else {
        console.warn('[决策] 决策失败，使用默认策略');
      }
      
      // 更新系统指标
      if (this.system && this.system.metrics) {
        this.system.metrics.decisionsMade = (this.system.metrics.decisionsMade || 0) + 1;
      }
      
    } catch (err) {
      console.error('[AutonomousDecision] 决策周期错误:', err.message);
    }
  }

  buildDecisionContext() {
    // 构建决策上下文
    const context = {
      timestamp: Date.now(),
      criteria: [
        { name: 'risk', weight: 0.3, direction: 'min' },
        { name: 'profit', weight: 0.4, direction: 'max' },
        { name: 'speed', weight: 0.2, direction: 'max' },
        { name: 'reliability', weight: 0.1, direction: 'max' }
      ],
      weights: { risk: 0.3, profit: 0.4, speed: 0.2, reliability: 0.1 },
      evidence: {},
      state: 'trading'
    };
    
    return context;
  }

  generateOptions(context) {
    // 生成候选决策选项
    return [
      { id: 1, name: '保守策略', scores: { risk: 2, profit: 3, speed: 4, reliability: 8 }, baseScore: 0.7 },
      { id: 2, name: '平衡策略', scores: { risk: 4, profit: 5, speed: 5, reliability: 6 }, baseScore: 0.8 },
      { id: 3, name: '激进策略', scores: { risk: 6, profit: 8, speed: 8, reliability: 4 }, baseScore: 0.9 },
      { id: 4, name: '防御策略', scores: { risk: 1, profit: 2, speed: 2, reliability: 9 }, baseScore: 0.6 }
    ];
  }

  async executeDecision(option) {
    // 执行决策 (根据选项类型)
    console.log(`[执行] 应用策略: ${option.name}`);
    
    // 这里可以调用系统的其他模块来执行具体策略
    // 例如: 调整风险控制参数、修改交易策略等
    
    return true;
  }

  async getMetrics() {
    if (!this.decision) return { initialized: false };
    return await this.decision.getMetrics();
  }

  async getStatus() {
    return {
      initialized: this.initialized,
      metrics: await this.getMetrics(),
      version: '1.0.0'
    };
  }
}

module.exports = { AutonomousDecision };
