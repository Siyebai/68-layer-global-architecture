#!/usr/bin/env node
// Evolutionary Algorithm Engine - V7.3
// 子自主进化系统：遗传算法 + 强化学习进化 + 贝叶斯优化

class EvolutionaryAlgorithmEngine {
  constructor() {
    this.name = 'evolutionary-algorithm';
    this.enabled = true;
    this.population = [];
    this.generation = 0;
    this.populationSize = 50;
    this.mutationRate = 0.1;
    this.crossoverRate = 0.8;
    this.elitismCount = 5;
    this.fitnessHistory = [];
    this.maxGenerations = 1000;
    this.stagnationThreshold = 50; // 停滞代数
    this.stagnationCount = 0;
    this.bestFitness = 0;
  }

  // 初始化种群
  initializePopulation(genomeTemplate) {
    this.population = [];
    for (let i = 0; i < this.populationSize; i++) {
      const individual = this.createRandomGenome(genomeTemplate);
      this.population.push({
        genome: individual,
        fitness: 0,
        age: 0,
        parents: []
      });
    }
    console.log(`[Evolutionary] Initialized population: ${this.populationSize} individuals`);
    return this.population;
  }

  // 创建随机基因组
  createRandomGenome(template) {
    const genome = {};
    for (const [key, type] of Object.entries(template)) {
      switch (type) {
        case 'float':
          genome[key] = Math.random() * 2 - 1; // [-1, 1]
          break;
        case 'int':
          genome[key] = Math.floor(Math.random() * 10);
          break;
        case 'bool':
          genome[key] = Math.random() > 0.5;
          break;
        case 'categorical':
          genome[key] = template[key][Math.floor(Math.random() * template[key].length)];
          break;
        default:
          genome[key] = null;
      }
    }
    return genome;
  }

  // 评估种群适应度
  async evaluatePopulation(fitnessFunction) {
    const evaluations = [];
    
    for (const individual of this.population) {
      try {
        const fitness = await fitnessFunction(individual.genome);
        individual.fitness = fitness;
        individual.age++;
        evaluations.push(fitness);
      } catch (error) {
        console.error('[Evolutionary] Fitness evaluation failed:', error.message);
        individual.fitness = 0;
      }
    }

    // 按适应度排序 (降序)
    this.population.sort((a, b) => b.fitness - a.fitness);

    // 记录历史
    const avgFitness = evaluations.reduce((a, b) => a + b, 0) / evaluations.length;
    const maxFitness = Math.max(...evaluations);
    this.fitnessHistory.push({
      generation: this.generation,
      avg: avgFitness,
      max: maxFitness,
      timestamp: Date.now()
    });

    // 检查停滞
    if (maxFitness > this.bestFitness) {
      this.bestFitness = maxFitness;
      this.stagnationCount = 0;
    } else {
      this.stagnationCount++;
    }

    return {
      avgFitness,
      maxFitness,
      bestGenome: this.population[0].genome,
      evaluations: this.population.length
    };
  }

  // 选择父母 (轮盘赌)
  selectParents() {
    const totalFitness = this.population.reduce((sum, ind) => sum + Math.max(ind.fitness, 0.001), 0);
    const parents = [];
    
    for (let i = 0; i < 2; i++) {
      let r = Math.random() * totalFitness;
      let cumulative = 0;
      
      for (const individual of this.population) {
        cumulative += Math.max(individual.fitness, 0.001);
        if (r <= cumulative) {
          parents.push(individual);
          break;
        }
      }
    }

    return parents;
  }

  // 交叉操作
  crossover(parent1, parent2) {
    const child = {};
    const keys = Object.keys(parent1.genome);
    
    for (const key of keys) {
      if (Math.random() < this.crossoverRate) {
        child[key] = parent1.genome[key];
      } else {
        child[key] = parent2.genome[key];
      }
    }

    return child;
  }

  // 变异操作
  mutate(genome, template) {
    const mutated = { ...genome };
    
    for (const [key, type] of Object.entries(template)) {
      if (Math.random() < this.mutationRate) {
        switch (type) {
          case 'float':
            // 高斯变异
            mutated[key] += (Math.random() * 2 - 1) * 0.1;
            mutated[key] = Math.max(-1, Math.min(1, mutated[key]));
            break;
          case 'int':
            mutated[key] = Math.max(0, mutated[key] + Math.floor(Math.random() * 3 - 1));
            break;
          case 'bool':
            mutated[key] = !mutated[key];
            break;
          case 'categorical':
            const options = template[key];
            mutated[key] = options[Math.floor(Math.random() * options.length)];
            break;
        }
      }
    }

    return mutated;
  }

  // 生成新一代
  evolve(template) {
    const newPopulation = [];

    // 1. 精英保留
    const elites = this.population.slice(0, this.elitismCount);
    for (const elite of elites) {
      newPopulation.push({
        genome: { ...elite.genome },
        fitness: 0,
        age: 0,
        parents: [elite]
      });
    }

    // 2. 生成剩余个体
    while (newPopulation.length < this.populationSize) {
      const [parent1, parent2] = this.selectParents();
      let childGenome;

      if (Math.random() < this.crossoverRate) {
        childGenome = this.crossover(parent1, parent2);
      } else {
        childGenome = { ...parent1.genome };
      }

      childGenome = this.mutate(childGenome, template);
      
      newPopulation.push({
        genome: childGenome,
        fitness: 0,
        age: 0,
        parents: [parent1, parent2]
      });
    }

    this.population = newPopulation;
    this.generation++;

    console.log(`[Evolutionary] Generation ${this.generation}: population size ${this.population.length}`);
    return this.population;
  }

  // 自适应参数调整
  adaptParameters() {
    if (this.fitnessHistory.length < 10) return;

    const recent = this.fitnessHistory.slice(-10);
    const improvement = recent[recent.length - 1].max - recent[0].max;

    if (improvement < 0.001) {
      // 停滞: 增加变异率，减少交叉率
      this.mutationRate = Math.min(0.3, this.mutationRate * 1.2);
      this.crossoverRate = Math.max(0.5, this.crossoverRate * 0.9);
      console.log(`[Evolutionary] Stagnation detected: mutation=${this.mutationRate.toFixed(3)}, crossover=${this.crossoverRate.toFixed(3)}`);
    } else {
      // 进步: 恢复参数
      this.mutationRate = Math.max(0.05, this.mutationRate * 0.95);
      this.crossoverRate = Math.min(0.9, this.crossoverRate * 1.02);
    }
  }

  // 运行进化循环
  async evolveUntil(fitnessFunction, template, stopCondition) {
    console.log('[Evolutionary] Starting evolutionary optimization...');
    
    this.initializePopulation(template);
    
    let generation = 0;
    while (generation < this.maxGenerations && !stopCondition(this)) {
      // 评估
      const stats = await this.evaluatePopulation(fitnessFunction);
      
      // 报告
      if (generation % 10 === 0) {
        console.log(`[Evolutionary] Gen ${generation}: max=${stats.maxFitness.toFixed(4)}, avg=${stats.avgFitness.toFixed(4)}`);
      }

      // 检查是否找到解决方案
      if (stats.maxFitness >= 0.99) {
        console.log(`[Evolutionary] Solution found at generation ${generation}`);
        return this.population[0].genome;
      }

      // 进化
      this.evolve(template);
      this.adaptParameters();
      generation++;

      // 检查停滞
      if (this.stagnationCount >= this.stagnationThreshold) {
        console.log(`[Evolutionary] Stagnation after ${generation} generations. Best fitness: ${this.bestFitness.toFixed(4)}`);
        break;
      }
    }

    return this.population[0].genome; // 返回最佳个体
  }

  // 获取进化统计
  getEvolutionStatistics() {
    const recentHistory = this.fitnessHistory.slice(-100);
    const avgImprovement = recentHistory.length > 1 ? 
      (recentHistory[recentHistory.length - 1].max - recentHistory[0].max) / recentHistory.length : 0;

    return {
      generation: this.generation,
      populationSize: this.populationSize,
      bestFitness: this.bestFitness,
      avgImprovementRate: avgImprovement,
      stagnationCount: this.stagnationCount,
      totalEvaluations: this.populationSize * this.generation,
      historySize: this.fitnessHistory.length
    };
  }

  getStatus() {
    return {
      name: this.name,
      enabled: this.enabled,
      generation: this.generation,
      bestFitness: this.bestFitness,
      populationSize: this.population.length,
      mutationRate: this.mutationRate,
      crossoverRate: this.crossoverRate,
      stagnationCount: this.stagnationCount,
      status: 'active'
    };
  }
}

module.exports = { EvolutionaryAlgorithmEngine };
