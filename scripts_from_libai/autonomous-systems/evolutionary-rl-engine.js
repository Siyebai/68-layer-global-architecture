#!/usr/bin/env node
// Evolutionary Reinforcement Learning - V7.3
// 结合遗传算法和强化学习的进化方法

class EvolutionaryReinforcementEngine {
  constructor() {
    this.name = 'evolutionary-rl';
    this.enabled = true;
    this.population = [];
    this.populationSize = 20;
    this.mutationRate = 0.2;
    this.elitismCount = 4;
    this.generation = 0;
    this.bestReward = -Infinity;
    this.rewardHistory = [];
    this.strategyPool = new Map(); // 策略池
  }

  // 初始化策略种群
  initializePopulation(strategyTemplate) {
    this.population = [];
    for (let i = 0; i < this.populationSize; i++) {
      const strategy = this.createRandomStrategy(strategyTemplate);
      this.population.push({
        id: `pop-${this.generation}-${i}`,
        strategy,
        reward: 0,
        fitness: 0,
        age: 0,
        parentIds: []
      });
    }
    console.log(`[EvoRL] Initialized ${this.populationSize} strategies`);
    return this.population;
  }

  createRandomStrategy(template) {
    const strategy = {};
    for (const [key, config] of Object.entries(template)) {
      switch (config.type) {
        case 'float':
          strategy[key] = config.min + Math.random() * (config.max - config.min);
          break;
        case 'int':
          strategy[key] = Math.floor(config.min + Math.random() * (config.max - config.min + 1));
          break;
        case 'bool':
          strategy[key] = Math.random() > 0.5;
          break;
        case 'array':
          strategy[key] = config.values[Math.floor(Math.random() * config.values.length)];
          break;
      }
    }
    return strategy;
  }

  // 评估策略种群
  async evaluatePopulation(evaluateFn, env) {
    const results = [];
    
    for (const individual of this.population) {
      try {
        // 在环境中评估策略
        const reward = await evaluateFn(individual.strategy, env);
        individual.reward = reward;
        individual.fitness = this.calculateFitness(reward);
        individual.age++;
        results.push(reward);
      } catch (error) {
        console.error(`[EvoRL] Evaluation failed for ${individual.id}:`, error.message);
        individual.reward = -1000;
        individual.fitness = 0;
      }
    }

    // 排序
    this.population.sort((a, b) => b.fitness - a.fitness);

    // 记录最佳
    if (this.population[0].fitness > this.bestReward) {
      this.bestReward = this.population[0].fitness;
    }

    this.rewardHistory.push({
      generation: this.generation,
      best: Math.max(...results),
      avg: results.reduce((a, b) => a + b, 0) / results.length,
      worst: Math.min(...results),
      timestamp: Date.now()
    });

    return {
      bestFitness: this.population[0].fitness,
      bestStrategy: this.population[0].strategy,
      avgFitness: results.reduce((a, b) => a + b, 0) / results.length,
      evaluated: this.population.length
    };
  }

  // 计算适应度 (多目标优化)
  calculateFitness(reward, complexity = 0, novelty = 0) {
    // 综合适应度: 奖励 - 复杂度惩罚 + 新颖性奖励
    const lambda = 0.01; // 复杂度权重
    const gamma = 0.1;  // 新颖性权重
    
    return reward - lambda * complexity + gamma * novelty;
  }

  // 选择父母 (锦标赛选择)
  tournamentSelect(tournamentSize = 3) {
    let best = null;
    let bestFitness = -Infinity;
    
    for (let i = 0; i < tournamentSize; i++) {
      const candidate = this.population[Math.floor(Math.random() * this.population.length)];
      if (candidate.fitness > bestFitness) {
        bestFitness = candidate.fitness;
        best = candidate;
      }
    }
    
    return best;
  }

  // 交叉: 算术交叉
  crossover(parent1, parent2, template) {
    const child = {};
    const alpha = 0.5; // 混合系数
    
    for (const key of Object.keys(template)) {
      if (Math.random() < 0.5) {
        // 算术混合
        const type = template[key].type;
        if (type === 'float') {
          child[key] = alpha * parent1.strategy[key] + (1 - alpha) * parent2.strategy[key];
        } else if (type === 'int') {
          child[key] = Math.round(alpha * parent1.strategy[key] + (1 - alpha) * parent2.strategy[key]);
        } else {
          child[key] = Math.random() > 0.5 ? parent1.strategy[key] : parent2.strategy[key];
        }
      } else {
        child[key] = Math.random() > 0.5 ? parent1.strategy[key] : parent2.strategy[key];
      }
    }
    
    return child;
  }

  // 变异: 高斯扰动
  mutate(strategy, template) {
    const mutated = { ...strategy };
    
    for (const [key, config] of Object.entries(template)) {
      if (Math.random() < this.mutationRate) {
        switch (config.type) {
          case 'float':
            mutated[key] += (Math.random() * 2 - 1) * (config.max - config.min) * 0.1;
            mutated[key] = Math.max(config.min, Math.min(config.max, mutated[key]));
            break;
          case 'int':
            mutated[key] = Math.max(config.min, Math.min(config.max, 
              mutated[key] + Math.floor(Math.random() * 3 - 1)));
            break;
          case 'bool':
            mutated[key] = !mutated[key];
            break;
          case 'array':
            mutated[key] = config.values[Math.floor(Math.random() * config.values.length)];
            break;
        }
      }
    }
    
    return mutated;
  }

  // 生成新一代
  evolve(strategyTemplate) {
    const newPopulation = [];
    
    // 1. 精英保留
    const elites = this.population.slice(0, this.elitismCount);
    for (const elite of elites) {
      newPopulation.push({
        id: `elite-${this.generation}-${elite.id}`,
        strategy: { ...elite.strategy },
        reward: 0,
        fitness: 0,
        age: 0,
        parentIds: [elite.id]
      });
    }
    
    // 2. 生成剩余个体
    while (newPopulation.length < this.populationSize) {
      const parent1 = this.tournamentSelect();
      const parent2 = this.tournamentSelect();
      let childStrategy;
      
      if (Math.random() < 0.8) {
        childStrategy = this.crossover(parent1, parent2, strategyTemplate);
      } else {
        childStrategy = { ...parent1.strategy };
      }
      
      childStrategy = this.mutate(childStrategy, strategyTemplate);
      
      newPopulation.push({
        id: `child-${this.generation}-${newPopulation.length}`,
        strategy: childStrategy,
        reward: 0,
        fitness: 0,
        age: 0,
        parentIds: [parent1.id, parent2.id]
      });
    }
    
    this.population = newPopulation;
    this.generation++;
    
    console.log(`[EvoRL] Generation ${this.generation}: ${this.population.length} strategies`);
    return this.population;
  }

  // 运行进化优化
  async optimize(evaluateFn, env, strategyTemplate, stopCondition) {
    console.log('[EvoRL] Starting evolutionary RL optimization...');
    
    this.initializePopulation(strategyTemplate);
    
    let gen = 0;
    while (gen < 500 && !stopCondition(this)) {
      const stats = await this.evaluatePopulation(evaluateFn, env);
      
      if (gen % 10 === 0) {
        console.log(`[EvoRL] Gen ${gen}: best=${stats.bestFitness.toFixed(4)}, avg=${stats.avgFitness.toFixed(4)}`);
      }
      
      if (stats.bestFitness >= 0.95) {
        console.log(`[EvoRL] Optimal strategy found at generation ${gen}`);
        return this.population[0].strategy;
      }
      
      this.evolve(strategyTemplate);
      gen++;
    }
    
    return this.population[0].strategy;
  }

  getStatus() {
    return {
      name: this.name,
      enabled: this.enabled,
      generation: this.generation,
      bestReward: this.bestReward,
      populationSize: this.population.length,
      mutationRate: this.mutationRate,
      historySize: this.rewardHistory.length,
      status: 'active'
    };
  }
}

module.exports = { EvolutionaryReinforcementEngine };
