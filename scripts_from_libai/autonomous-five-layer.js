#!/usr/bin/env node
// V26 五层认知自主系统 - 借鉴Q李白V5.0架构
// 将十大自主模块整合为五层认知架构

const { AutonomousThinking } = require('./autonomous-thinking');
const { AutonomousLearningEnhanced } = require('./autonomous-learning-enhanced');
const { AutonomousHealing } = require('./autonomous-healing');
const { AutonomousMonitorEnhanced } = require('./autonomous-monitor-enhanced');
const { AutonomousDecision } = require('./autonomous-decision');
const { AutonomousIterationEnhanced } = require('./autonomous-iteration-enhanced');
const { AutonomousCreation } = require('./autonomous-creation');
const { AutonomousDeployment } = require('./autonomous-deployment');
const { AutonomousCommunication } = require('./autonomous-communication');
const { AdaptiveRiskControl } = require('./adaptive-risk-control');

class FiveLayerAutonomousSystem {
  constructor(tradingSystem) {
    this.system = tradingSystem;
    this.layers = {};
    this.startTime = Date.now();
    this.stats = {
      cycles: 0,
      perceptions: 0,
      cognitions: 0,
      actions: 0,
      learnings: 0,
      evolutions: 0
    };
  }

  async start() {
    console.log('\n==========================================');
    console.log('  启动 V26 五层认知自主系统 V5.0');
    console.log('==========================================\n');
    
    try {
      // 第1层: 感知层 (Perception Layer)
      console.log('第1层 [感知层] 初始化...');
      this.layers.perception = {
        monitor: new AutonomousMonitorEnhanced(this.system),
        healing: new AutonomousHealing(this.system),
        riskControl: new AdaptiveRiskControl(9999, 0)
      };
      this.layers.perception.monitor.start();
      this.layers.perception.healing.start();
      this.layers.perception.riskControl.start();
      console.log('✅ 第1层 [感知层] 已启动: 监控+修复+风险控制');
      
      // 第2层: 认知层 (Cognition Layer)
      console.log('第2层 [认知层] 初始化...');
      try {
        this.layers.cognition = {
          thinking: new AutonomousThinking(this.system),
          decision: new AutonomousDecision(this.system)
        };
        this.layers.cognition.thinking.start();
        console.log('✅ 第2层 [认知层] 已启动: 思考+决策');
      } catch (err) {
        console.error('❌ 第2层 [认知层] 启动失败:', err.message);
        throw err;
      }
      
      // 第3层: 行动层 (Action Layer)
      console.log('第3层 [行动层] 初始化...');
      try {
        this.layers.action = {
          learning: new AutonomousLearningEnhanced(this.system),
          iteration: new AutonomousIterationEnhanced(this.system),
          creation: new AutonomousCreation(this.system),
          deployment: new AutonomousDeployment(this.system)
        };
        this.layers.action.learning.start();
        this.layers.action.iteration.start();
        this.layers.action.creation.start();
        console.log('✅ 第3层 [行动层] 已启动: 学习+迭代+创造+部署');
      } catch (err) {
        console.error('❌ 第3层 [行动层] 启动失败:', err.message);
        throw err;
      }
      
      // 第4层: 学习层 (Learning Layer)
      console.log('第4层 [学习层] 初始化...');
      try {
        this.layers.learning = {
          communication: new AutonomousCommunication(this.system),
          knowledgeTransfer: this.layers.action.learning
        };
        console.log('✅ 第4层 [学习层] 已启动: 通信+知识迁移');
      } catch (err) {
        console.error('❌ 第4层 [学习层] 启动失败:', err.message);
        throw err;
      }
      
      // 第5层: 进化层 (Evolution Layer)
      console.log('第5层 [进化层] 初始化...');
      this.layers.evolution = {
        selfOptimization: this.layers.action.iteration,
        capabilityExpansion: this.layers.action.creation,
        maturityImprovement: this.layers.action.learning
      };
      console.log('✅ 第5层 [进化层] 已启动: 自优化+扩展+成熟度');
      
      // 启动周期协调器
      this.startCycleCoordinator();
      
      console.log('\n🎯 五层认知自主系统已完全启动');
      console.log('==========================================');
      console.log('  快速思考: 1分钟间隔');
      console.log('  完整周期: 5分钟间隔');
      console.log('  深度学习: 10分钟间隔');
      console.log('  自动进化: 10周期触发一次');
      console.log('==========================================\n');
      
    } catch (err) {
      console.error('❌ 五层自主系统启动失败:', err.message);
      console.error('堆栈:', err.stack);
      throw err; // 重新抛出，让上层知道启动失败
    }
  }

  startCycleCoordinator() {
    // 快速思考周期 (1分钟) - 感知+认知
    setInterval(() => {
      this.perceptionCycle();
      this.cognitionCycle();
    }, 60 * 1000);
    
    // 完整周期 (5分钟) - 五层全流程
    setInterval(() => {
      this.fullCycle();
    }, 5 * 60 * 1000);
    
    // 深度学习周期 (10分钟) - 学习层强化
    setInterval(() => {
      this.deepLearningCycle();
    }, 10 * 60 * 1000);
    
    // 自动进化检查 (每10个完整周期)
    let cycleCount = 0;
    setInterval(() => {
      cycleCount++;
      if (cycleCount >= 10) {
        this.evolutionCycle();
        cycleCount = 0;
      }
    }, 5 * 60 * 1000);
  }

  // 感知层周期
  async perceptionCycle() {
    try {
      this.stats.perceptions++;
      await this.layers.perception.monitor.checkSystemHealth();
      await this.layers.perception.healing.detectAndHeal();
    } catch (err) {
      console.error('[感知层] 周期执行失败:', err.message);
    }
  }

  // 认知层周期
  async cognitionCycle() {
    try {
      this.stats.cognitions++;
      await this.layers.cognition.thinking.think();
    } catch (err) {
      console.error('[认知层] 周期执行失败:', err.message);
    }
  }

  // 行动层周期
  async actionCycle() {
    try {
      this.stats.actions++;
      await this.layers.action.learning.learn();
      await this.layers.action.iteration.iterate();
      await this.layers.action.creation.create();
    } catch (err) {
      console.error('[行动层] 周期执行失败:', err.message);
    }
  }

  // 学习层周期
  async learningCycle() {
    try {
      this.stats.learnings++;
      // 通信模块按需调用
    } catch (err) {
      console.error('[学习层] 周期执行失败:', err.message);
    }
  }

  // 进化层周期
  async evolutionCycle() {
    try {
      this.stats.evolutions++;
      console.log('\n🔄 触发自动进化周期...');
      await this.layers.evolution.selfOptimization.optimize();
      await this.layers.evolution.capabilityExpansion.expand();
      await this.layers.evolution.maturityImprovement.improve();
      console.log('✅ 自动进化完成\n');
    } catch (err) {
      console.error('[进化层] 周期执行失败:', err.message);
    }
  }

  // 完整五层周期 (5分钟)
  async fullCycle() {
    try {
      this.stats.cycles++;
      console.log(`\n🔔 开始第 ${this.stats.cycles} 个完整五层周期`);
      
      await this.perceptionCycle();
      await this.cognitionCycle();
      await this.actionCycle();
      await this.learningCycle();
      
      console.log(`✅ 第 ${this.stats.cycles} 个完整周期完成\n`);
    } catch (err) {
      console.error('[完整周期] 执行失败:', err.message);
    }
  }

  // 深度学习周期 (10分钟)
  async deepLearningCycle() {
    try {
      console.log('\n📚 开始深度学习周期...');
      await this.layers.learning.knowledgeTransfer.learn();
      console.log('✅ 深度学习完成\n');
    } catch (err) {
      console.error('[深度学习] 执行失败:', err.message);
    }
  }

  getStatus() {
    const uptime = Date.now() - this.startTime;
    const layerStatus = {};
    
    for (const [layerName, modules] of Object.entries(this.layers)) {
      layerStatus[layerName] = {
        modules: Object.keys(modules),
        running: Object.values(modules).filter(m => m.running || (m.start && m.interval)).length
      };
    }
    
    return {
      version: '5.0',
      name: 'FiveLayerAutonomousSystem',
      layers: layerStatus,
      stats: this.stats,
      uptime,
      autonomousLevel: this.calculateAutonomousLevel()
    };
  }

  calculateAutonomousLevel() {
    // 基于五层架构计算自主等级 (0-100)，目标达到99%
    const base = 60; // 五层基础分更高
    
    // 每完成一个周期加1分 (最多20分)
    const cycleScore = Math.min(this.stats.cycles, 20);
    
    // 各层活跃度
    let layerScore = 0;
    for (const [layerName, modules] of Object.entries(this.layers)) {
      const runningCount = Object.values(modules).filter(m => m.running || (m.start && m.interval)).length;
      if (runningCount > 0) layerScore += 5; // 每层最多5分
    }
    
    // 知识库大小加分
    const kbSize = this.system.learningEngine ? this.system.learningEngine.knowledgeBase.size : 0;
    const knowledgeScore = Math.min(kbSize / 10, 20); // 每10个知识1分，最多20分
    
    // 交易表现加分
    const metrics = this.system.state ? this.system.state.metrics : {};
    let performanceScore = 0;
    if (metrics.tradesExecuted > 0) performanceScore += 10;
    if (metrics.profit > 0) performanceScore += 10;
    
    const total = base + cycleScore + layerScore + knowledgeScore + performanceScore;
    return Math.min(Math.round(total), 100);
  }
}

module.exports = { FiveLayerAutonomousSystem };
