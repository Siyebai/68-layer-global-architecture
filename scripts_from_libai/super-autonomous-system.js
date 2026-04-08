#!/usr/bin/env node
// 超级自主系统 V3.0 - 借鉴Q李白架构
// 集成十大自主模块

const { AutonomousThinking } = require('./autonomous-thinking');
const { AutonomousLearningEnhanced } = require('./autonomous-learning-enhanced');
const { AutonomousHealing } = require('./autonomous-healing');
const { AutonomousMonitorEnhanced } = require('./autonomous-monitor-enhanced');
const { AutonomousDecision } = require('./autonomous-decision');
const { AutonomousIterationEnhanced } = require('./autonomous-iteration-enhanced');
const { AutonomousCreation } = require('./autonomous-creation');
const { AutonomousDeployment } = require('./autonomous-deployment');
const { AutonomousCommunication } = require('./autonomous-communication');

class SuperAutonomousSystem {
  constructor(tradingSystem) {
    this.system = tradingSystem;
    this.modules = {};
    this.startTime = Date.now();
  }

  async start() {
    console.log('\n==========================================');
    console.log('  启动超级自主系统 V3.0');
    console.log('  借鉴Q李白架构，十大模块全面启用');
    console.log('==========================================\n');
    
    // 1. 自主监控 (30秒) - 最先启动，负责监控其他模块
    this.modules.monitor = new AutonomousMonitorEnhanced(this.system);
    this.modules.monitor.start();
    
    // 2. 自主修复 (2分钟) - 快速响应问题
    this.modules.healing = new AutonomousHealing(this.system);
    this.modules.healing.start();
    
    // 3. 自主思考 (1分钟) - 持续分析环境
    this.modules.thinking = new AutonomousThinking(this.system);
    this.modules.thinking.start();
    
    // 4. 自主学习 (5分钟) - 从数据中学习
    this.modules.learning = new AutonomousLearningEnhanced(this.system);
    this.modules.learning.start();
    
    // 5. 自主决策 (按需) - 基于思考和学习做决策
    this.modules.decision = new AutonomousDecision(this.system);
    
    // 6. 自主迭代 (15分钟) - 优化参数
    this.modules.iteration = new AutonomousIterationEnhanced(this.system);
    this.modules.iteration.start();
    
    // 7. 自主创造 (30分钟) - 生成新策略
    this.modules.creation = new AutonomousCreation(this.system);
    this.modules.creation.start();
    
    // 8. 自主通信 (按需) - 知识共享
    this.modules.communication = new AutonomousCommunication(this.system);
    
    // 9. 自主部署 (按需) - 部署新策略
    this.modules.deployment = new AutonomousDeployment(this.system);
    
    console.log('\n✅ 十大自主模块全部启动');
    console.log('==========================================');
    console.log('  超级自主系统 V3.0 运行中...');
    console.log('==========================================\n');
  }

  getStatus() {
    const uptime = Date.now() - this.startTime;
    return {
      version: '3.0',
      name: 'SuperAutonomousSystem',
      modules: Object.keys(this.modules),
      uptime,
      autonomousLevel: this.calculateAutonomousLevel()
    };
  }

  calculateAutonomousLevel() {
    // 基于模块运行状态和指标计算自主等级 (0-100)
    const base = 50; // 基础分
    
    // 每个运行的模块加5分
    const runningModules = Object.values(this.modules).filter(m => m.running).length;
    const moduleScore = runningModules * 5;
    
    // 基于指标加分
    const metrics = this.system.state.metrics;
    let metricScore = 0;
    if (metrics.learningCycles > 0) metricScore += 10;
    if (metrics.knowledgeBaseSize > 100) metricScore += 10;
    if (metrics.tradesExecuted > 0) metricScore += 10;
    
    return Math.min(base + moduleScore + metricScore, 100);
  }
}

module.exports = { SuperAutonomousSystem };
