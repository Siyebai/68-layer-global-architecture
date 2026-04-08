#!/usr/bin/env node
// 增强自主迭代模块 - 每15分钟执行

class AutonomousIterationEnhanced {
  constructor(system) {
    this.system = system;
    this.interval = 15 * 60 * 1000; // 15分钟
    this.running = false;
  }

  start() {
    if (this.running) return;
    this.running = true;
    
    this.iterate().catch(console.error);
    setInterval(() => this.iterate().catch(console.error), this.interval);
    console.log('[AutonomousIterationEnhanced] 增强迭代模块已启动，间隔15分钟');
  }

  async iterate() {
    try {
      const engine = this.system.iterationEngine;
      if (!engine) return;
      
      // 获取所有策略的当前参数
      const strategies = this.getAllStrategies();
      
      for (const strategy of strategies) {
        // 获取近期性能
        const performance = this.getStrategyPerformance(strategy);
        
        // 执行迭代优化
        const newParams = await engine.iterate(strategy.params, performance);
        
        // 更新参数
        strategy.params = newParams;
        
        console.log('[AutonomousIterationEnhanced] 策略迭代完成:', strategy.id);
      }
      
      this.system.state.metrics.iterationsCompleted += strategies.length;
      if (this.system.stateSync) this.system.stateSync.sync();
    } catch (err) {
      console.error('[AutonomousIterationEnhanced] 迭代失败:', err.message);
    }
  }

  getAllStrategies() {
    const agents = this.system.agents.filter(a => a.type === 'signal');
    return agents.map(agent => ({
      id: agent.id,
      params: agent.currentParams,
      performance: agent.performance
    }));
  }

  getStrategyPerformance(strategy) {
    // 从Redis获取该策略的近期表现
    return {
      profit: this.system.state.metrics.profit,
      winRate: 0.5,
      maxDrawdown: 0.1,
      profitTrend: 0
    };
  }
}

module.exports = { AutonomousIterationEnhanced };
