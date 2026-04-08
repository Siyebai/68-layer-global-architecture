// 模拟训练智能体
class SimulationTrainingAgent extends BaseAgent {
  constructor(id, teamId) {
    super(id, teamId, 'simulation');
    this.role = 'training';
    this.trainSessions = [];
  }

  onData(data) {
    // 接收市场数据，生成模拟训练场景
    this.trainSessions.push({
      timestamp: Date.now(),
      data: data,
      outcome: this.evaluateScenario(data)
    });
    
    this.state.messageCount++;
    const analysis = this.analyzeScenario(data);
    this.emit('training-update', {
      agentId: this.id,
      scenario: analysis,
      timestamp: Date.now()
    });
  }

  evaluateScenario(data) {
    // 评估交易场景
    return {
      difficulty: this.calcDifficulty(data),
      profitPotential: this.calcProfitPotential(data),
      riskLevel: this.calcRisk(data)
    };
  }

  analyzeScenario(data) {
    // 提取训练要点
    return {
      pattern: data.symbol,
      strategy: this.selectStrategy(data),
      confidence: this.calcConfidence(data)
    };
  }

  calcDifficulty(data) {
    // 计算场景复杂度
    const volatility = data.volatility || 0.01;
    return Math.min(volatility * 100, 10).toFixed(1);
  }

  calcProfitPotential(data) {
    // 计算盈利潜力
    const spread = data.ask - data.bid;
    return (spread / data.bid * 100).toFixed(4);
  }

  calcRisk(data) {
    // 计算风险等级
    return Math.random() > 0.5 ? 'low' : 'medium';
  }

  selectStrategy(data) {
    // 选择训练策略
    const strategies = ['scalping', 'swing', 'trend'];
    return strategies[Math.floor(Math.random() * strategies.length)];
  }

  calcConfidence(data) {
    // 计算信号可信度
    return (60 + Math.random() * 40).toFixed(1);
  }

  getHealth() {
    const base = super.getHealth();
    return {
      ...base,
      role: this.role,
      trainSessions: this.trainSessions.length
    };
  }
}
