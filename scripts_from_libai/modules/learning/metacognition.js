#!/usr/bin/env node
// 元认知模块 (Metacognition) - 学习层模块
// 自我监控、自我评估、自我调节

const { SimpleLogger } = require('../../utils/logger');

class MetacognitionModule {
  constructor(system) {
    this.system = system;
    this.logger = new SimpleLogger('info');
    this.initialized = false;
    this.running = false;
    this.metrics = {
      selfAwareness: 0,
      selfRegulation: 0,
      selfReflection: 0,
      learningEfficiency: 0
    };
    this.reflectionHistory = [];
  }

  async initialize() {
    this.logger.info('[Metacognition] 初始化元认知模块...');
    this.initialized = true;
    this.logger.info('[Metacognition] 初始化完成');
  }

  start() {
    if (!this.initialized) {
      this.logger.warn('[Metacognition] 未初始化，跳过启动');
      return;
    }
    
    this.running = true;
    this.logger.info('[Metacognition] 启动元认知循环...');
    
    // 启动自我反思循环 (每60秒)
    setInterval(() => this.reflect(), 60 * 1000);
    
    // 启动自我监控循环 (每30秒)
    setInterval(() => this.monitorSelf(), 30 * 1000);
    
    this.logger.info('[Metacognition] ✅ 元认知模块已启动');
  }

  // ========== 自我监控 ==========

  async monitorSelf() {
    try {
      const status = await this.system.getStatus();
      const metrics = status.metrics;
      
      // 计算自我意识得分
      this.metrics.selfAwareness = this.calculateSelfAwareness(status);
      this.metrics.learningEfficiency = this.calculateLearningEfficiency(metrics);
      
      this.logger.debug(`[监控] 自我意识: ${this.metrics.selfAwareness.toFixed(2)}, 学习效率: ${this.metrics.learningEfficiency.toFixed(2)}`);
      
    } catch (err) {
      this.logger.error('[监控] 错误:', err.message);
    }
  }

  calculateSelfAwareness(status) {
    // 基于系统完整性计算自我意识
    const totalAgents = status.agents.total || 288;
    const healthyAgents = status.agents.healthy || 0;
    const agentHealth = healthyAgents / totalAgents;
    
    const autonomy = (status.intelligence_level || 22) / 100;
    
    return agentHealth * 0.6 + autonomy * 0.4;
  }

  calculateLearningEfficiency(metrics) {
    const learningCycles = metrics.learningCycles || 0;
    const iterations = metrics.iterationsCompleted || 0;
    const total = learningCycles + iterations;
    
    // 简单线性归一化
    return Math.min(total / 1000, 1.0);
  }

  // ========== 自我反思 ==========

  async reflect() {
    try {
      const status = await this.system.getStatus();
      const reflection = {
        timestamp: Date.now(),
        selfAwareness: this.metrics.selfAwareness,
        learningEfficiency: this.metrics.learningEfficiency,
        systemStatus: status,
        insights: this.generateInsights(status)
      };
      
      this.reflectionHistory.push(reflection);
      if (this.reflectionHistory.length > 100) {
        this.reflectionHistory = this.reflectionHistory.slice(-50);
      }
      
      this.metrics.selfReflection++;
      
      this.logger.info(`[反思] 完成, 洞察: ${reflection.insights.length} 条`);
      
    } catch (err) {
      this.logger.error('[反思] 错误:', err.message);
    }
  }

  generateInsights(status) {
    const insights = [];
    
    // 基于系统状态生成洞察
    if (status.agents.healthy < status.agents.total) {
      insights.push({
        type: 'warning',
        message: `部分Agent离线: ${status.agents.healthy}/${status.agents.total}`,
        priority: 'high'
      });
    }
    
    if (status.metrics.errors > 10) {
      insights.push({
        type: 'error',
        message: `错误数量偏高: ${status.metrics.errors}`,
        priority: 'high'
      });
    }
    
    if (status.intelligence_level > 20) {
      insights.push({
        type: 'positive',
        message: `智能水平优秀: ${status.intelligence_level}`,
        priority: 'low'
      });
    }
    
    return insights;
  }

  // ========== 自我调节 ==========

  async selfRegulate() {
    // 根据反思结果自动调节系统参数
    const latestReflection = this.reflectionHistory[this.reflectionHistory.length - 1];
    if (!latestReflection) return;
    
    for (const insight of latestReflection.insights) {
      if (insight.priority === 'high') {
        await this.takeCorrectiveAction(insight);
      }
    }
    
    this.metrics.selfRegulation++;
  }

  async takeCorrectiveAction(insight) {
    this.logger.warn(`[调节] 处理问题: ${insight.message}`);
    
    switch (insight.type) {
      case 'warning':
        // 尝试重启离线Agent
        await this.restartAgents();
        break;
      case 'error':
        // 清理错误状态
        await this.clearErrors();
        break;
    }
  }

  async restartAgents() {
    // 重启离线Agent逻辑 (简化)
    this.logger.info('[调节] 触发Agent重启检查');
  }

  async clearErrors() {
    // 清理错误计数
    if (this.system && this.system.redis) {
      await this.system.redis.set('system:state:metrics:errors', 0);
      this.logger.info('[调节] 错误计数已重置');
    }
  }

  // ========== 公共接口 ==========

  async getMetrics() {
    return {
      ...this.metrics,
      reflectionCount: this.reflectionHistory.length,
      uptime: Date.now() - (this.startTime || Date.now())
    };
  }

  async getStatus() {
    return {
      initialized: this.initialized,
      running: this.running,
      metrics: this.metrics,
      historySize: this.reflectionHistory.length
    };
  }

  async getReflections(count = 10) {
    return this.reflectionHistory.slice(-count);
  }
}

module.exports = { MetacognitionModule };
