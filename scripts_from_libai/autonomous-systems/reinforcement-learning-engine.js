#!/usr/bin/env node
// Reinforcement Learning Engine - V7.3
// 强化学习：通过交互学习最优策略

class ReinforcementLearningEngine {
  constructor() {
    this.name = 'reinforcement-learning';
    this.enabled = true;
    this.qTable = new Map(); // Q表: state -> action -> value
    this.learningRate = 0.1; // α
    this.discountFactor = 0.95; // γ
    this.explorationRate = 0.3; // ε (ε-greedy)
    this.minExplorationRate = 0.01;
    this.explorationDecay = 0.995;
    this.transitions = []; // 经验回放缓冲区
    this.maxTransitions = 10000;
  }

  // 状态键生成
  stateKey(state) {
    return JSON.stringify(state);
  }

  // 获取Q值
  getQValue(state, action) {
    const stateKey = this.stateKey(state);
    const stateActions = this.qTable.get(stateKey) || new Map();
    return stateActions.get(action) || 0;
  }

  // 设置Q值
  setQValue(state, action, value) {
    const stateKey = this.stateKey(state);
    if (!this.qTable.has(stateKey)) {
      this.qTable.set(stateKey, new Map());
    }
    this.qTable.get(stateKey).set(action, value);
  }

  // ε-greedy策略选择动作
  async selectAction(state, availableActions) {
    const stateKey = this.stateKey(state);
    
    // 探索: 随机选择
    if (Math.random() < this.explorationRate) {
      return availableActions[Math.floor(Math.random() * availableActions.length)];
    }

    // 利用: 选择Q值最大的动作
    let bestAction = null;
    let bestValue = -Infinity;
    
    for (const action of availableActions) {
      const qValue = this.getQValue(state, action);
      if (qValue > bestValue) {
        bestValue = qValue;
        bestAction = action;
      }
    }

    // 如果所有Q值相同,随机选择
    if (bestAction === null) {
      bestAction = availableActions[Math.floor(Math.random() * availableActions.length)];
    }

    return bestAction;
  }

  // Q-learning更新
  async update(state, action, reward, nextState, done) {
    const currentQ = this.getQValue(state, action);
    
    if (done) {
      // 终止状态: Q(s,a) ← Q(s,a) + α * (r - Q(s,a))
      const newQ = currentQ + this.learningRate * (reward - currentQ);
      this.setQValue(state, action, newQ);
    } else {
      // 非终止状态: Q(s,a) ← Q(s,a) + α * (r + γ * max_a' Q(s',a') - Q(s,a))
      const nextStateKey = this.stateKey(nextState);
      const nextStateActions = this.qTable.get(nextStateKey) || new Map();
      let maxNextQ = 0;
      
      for (const qValue of nextStateActions.values()) {
        if (qValue > maxNextQ) maxNextQ = qValue;
      }
      
      const newQ = currentQ + this.learningRate * (
        reward + this.discountFactor * maxNextQ - currentQ
      );
      this.setQValue(state, action, newQ);
    }

    // 存储经验 (简化版,实际应使用经验回放)
    this.transitions.push({ state, action, reward, nextState, done });
    if (this.transitions.length > this.maxTransitions) {
      this.transitions.shift();
    }

    // 衰减探索率
    if (this.explorationRate > this.minExplorationRate) {
      this.explorationRate *= this.explorationDecay;
    }
  }

  // 批量更新 (从经验回放)
  async batchUpdate(batchSize = 32) {
    if (this.transitions.length === 0) return;

    const batch = this.transitions
      .sort(() => Math.random() - 0.5)
      .slice(0, Math.min(batchSize, this.transitions.length));

    for (const { state, action, reward, nextState, done } of batch) {
      await this.update(state, action, reward, nextState, done);
    }
  }

  // 获取最优策略
  getOptimalPolicy(state) {
    const stateKey = this.stateKey(state);
    const stateActions = this.qTable.get(stateKey) || new Map();
    
    let bestAction = null;
    let bestValue = -Infinity;
    
    for (const [action, value] of stateActions) {
      if (value > bestValue) {
        bestValue = value;
        bestAction = action;
      }
    }

    return {
      action: bestAction,
      value: bestValue,
      confidence: Math.min(bestValue / 100, 1) // 归一化置信度
    };
  }

  // 保存Q表
  saveQTable(filePath) {
    const data = {
      qTable: Object.fromEntries(this.qTable),
      explorationRate: this.explorationRate,
      timestamp: Date.now()
    };
    const fs = require('fs');
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
  }

  // 加载Q表
  loadQTable(filePath) {
    const fs = require('fs');
    if (fs.existsSync(filePath)) {
      const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
      this.qTable = new Map(Object.entries(data.qTable || {}));
      this.explorationRate = data.explorationRate || this.explorationRate;
      return true;
    }
    return false;
  }

  getStatus() {
    return {
      name: this.name,
      enabled: this.enabled,
      qTableSize: this.qTable.size,
      explorationRate: this.explorationRate,
      transitionsCount: this.transitions.length,
      learningRate: this.learningRate,
      discountFactor: this.discountFactor,
      status: 'active'
    };
  }
}

module.exports = { ReinforcementLearningEngine };
