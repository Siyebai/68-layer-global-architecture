#!/usr/bin/env node
// Autonomous Learning System - V7.3
// 自主学习系统主协调器：整合5大学习引擎

const MetaLearningEngine = require('./meta-learning-engine').MetaLearningEngine;
const TransferLearningEngine = require('./transfer-learning-engine').TransferLearningEngine;
const ReinforcementLearningEngine = require('./reinforcement-learning-engine').ReinforcementLearningEngine;
const ContinualLearningEngine = require('./continual-learning-engine').ContinualLearningEngine;
const UnsupervisedLearningEngine = require('./unsupervised-learning-engine').UnsupervisedLearningEngine;

class AutonomousLearningSystem {
  constructor() {
    this.name = 'autonomous-learning-system';
    this.enabled = true;
    this.engines = new Map();
    this.globalState = new Map();
    this.learningSession = null;
    this.sessionCount = 0;
    this.performanceHistory = [];
    this.maxHistorySize = 1000;
  }

  async initialize() {
    console.log('[AutonomousLearning] Initializing 5 learning engines...');

    // 初始化5大引擎
    this.engines.set('meta-learning', new MetaLearningEngine());
    this.engines.set('transfer-learning', new TransferLearningEngine());
    this.engines.set('reinforcement-learning', new ReinforcementLearningEngine());
    this.engines.set('continual-learning', new ContinualLearningEngine());
    this.engines.set('unsupervised-learning', new UnsupervisedLearningEngine());

    // 验证所有引擎状态
    for (const [name, engine] of this.engines) {
      const status = engine.getStatus();
      console.log(`[AutonomousLearning] Engine ${name}: ${status.status}`);
    }

    console.log('[AutonomousLearning] Initialization complete');
    return true;
  }

  // 开始学习会话
  async startLearningSession(sessionConfig) {
    this.sessionCount++;
    this.learningSession = {
      id: `session-${this.sessionCount}-${Date.now()}`,
      config: sessionConfig,
      startTime: Date.now(),
      enginesUsed: new Set(),
      tasksCompleted: 0,
      performance: 0
    };

    console.log(`[AutonomousLearning] Started session: ${this.learningSession.id}`);
    return this.learningSession.id;
  }

  // 执行学习任务
  async executeTask(taskType, taskData, options = {}) {
    if (!this.learningSession) {
      throw new Error('No active learning session. Call startLearningSession first.');
    }

    const startTime = Date.now();
    let result = null;

    try {
      switch (taskType) {
        case 'meta-select-strategy':
          result = await this.executeMetaSelectStrategy(taskData, options);
          break;
        case 'transfer-migrate':
          result = await this.executeTransferMigration(taskData, options);
          break;
        case 'rl-optimize':
          result = await this.executeRLOptimization(taskData, options);
          break;
        case 'continual-learn':
          result = await this.executeContinualLearning(taskData, options);
          break;
        case 'unsupervised-discover':
          result = await this.executeUnsupervisedDiscovery(taskData, options);
          break;
        default:
          throw new Error(`Unknown task type: ${taskType}`);
      }

      this.learningSession.tasksCompleted++;
      this.learningSession.enginesUsed.add(taskType);

      const duration = Date.now() - startTime;
      result.duration = duration;
      result.sessionId = this.learningSession.id;

      // 记录性能
      this.recordPerformance(result);

      return result;
    } catch (error) {
      console.error(`[AutonomousLearning] Task failed: ${taskType}`, error.message);
      throw error;
    }
  }

  // 元学习: 选择最优策略
  async executeMetaSelectStrategy(context, options) {
    const metaEngine = this.engines.get('meta-learning');
    if (!metaEngine) throw new Error('Meta-learning engine not initialized');

    // 确保有注册的策略
    if (metaEngine.learningStrategies.size === 0) {
      // 注册默认策略
      metaEngine.registerStrategy('default', { name: 'default' });
    }

    const bestStrategy = await metaEngine.selectBestStrategy(context);
    
    return {
      taskType: 'meta-select-strategy',
      strategy: bestStrategy,
      context,
      success: true
    };
  }

  // 迁移学习: 跨领域迁移
  async executeTransferMigration(targetDomain, options) {
    const transferEngine = this.engines.get('transfer-learning');
    if (!transferEngine) throw new Error('Transfer-learning engine not initialized');

    // 设置目标领域
    transferEngine.setTargetDomain(targetDomain);

    // 执行迁移
    const transferResult = await transferEngine.transferLearning();

    return {
      taskType: 'transfer-migrate',
      result: transferResult,
      success: transferResult.success
    };
  }

  // 强化学习: 优化决策
  async executeRLOptimization(stateActionData, options) {
    const rlEngine = this.engines.get('reinforcement-learning');
    if (!rlEngine) throw new Error('Reinforcement-learning engine not initialized');

    const { state, availableActions, reward, nextState, done } = stateActionData;

    // 选择动作
    const action = await rlEngine.selectAction(state, availableActions);

    // 更新Q值
    if (options.update !== false) {
      await rlEngine.update(state, action, reward, nextState, done);
    }

    return {
      taskType: 'rl-optimize',
      action,
      qValue: rlEngine.getQValue(state, action),
      explorationRate: rlEngine.explorationRate,
      success: true
    };
  }

  // 持续学习: 跨任务学习
  async executeContinualLearning(taskId, taskData, options) {
    const clEngine = this.engines.get('continual-learning');
    if (!clEngine) throw new Error('Continual-learning engine not initialized');

    // 开始新任务
    clEngine.startTask(taskId, taskData);

    // 执行联合训练 (如果有模型)
    let result = { success: true };
    if (options.model) {
      result = await clEngine.jointTraining(options.model, taskData, taskId);
    }

    // 评估遗忘
    const forgetting = clEngine.evaluateForgetting();

    return {
      taskType: 'continual-learn',
      taskId,
      result,
      forgetting,
      stats: clEngine.getLearningStatistics(),
      success: true
    };
  }

  // 无监督学习: 自动发现模式
  async executeUnsupervisedDiscovery(data, options) {
    const usEngine = this.engines.get('unsupervised-learning');
    if (!usEngine) throw new Error('Unsupervised-learning engine not initialized');

    const discovery = await usEngine.autoLearn(data, options);

    return {
      taskType: 'unsupervised-discover',
      discovery,
      success: discovery.success
    };
  }

  // 记录性能
  recordPerformance(result) {
    this.performanceHistory.push({
      sessionId: this.learningSession.id,
      taskType: result.taskType,
      duration: result.duration,
      success: result.success,
      timestamp: Date.now()
    });

    if (this.performanceHistory.length > this.maxHistorySize) {
      this.performanceHistory = this.performanceHistory.slice(-500);
    }

    // 更新会话性能
    const successes = this.performanceHistory.filter(p => p.success);
    this.learningSession.performance = successes.length / this.performanceHistory.length;
  }

  // 结束学习会话
  endLearningSession() {
    if (!this.learningSession) return null;

    const session = {
      ...this.learningSession,
      endTime: Date.now(),
      duration: Date.now() - this.learningSession.startTime,
      performance: this.learningSession.performance
    };

    console.log(`[AutonomousLearning] Ended session: ${session.id}`, {
      tasks: session.tasksCompleted,
      duration: session.duration,
      performance: session.performance
    });

    this.learningSession = null;
    return session;
  }

  // 获取系统状态
  getSystemStatus() {
    const enginesStatus = {};
    for (const [name, engine] of this.engines) {
      enginesStatus[name] = engine.getStatus();
    }

    return {
      name: this.name,
      enabled: this.enabled,
      sessionCount: this.sessionCount,
      activeSession: this.learningSession ? this.learningSession.id : null,
      engines: enginesStatus,
      performance: {
        totalTasks: this.performanceHistory.length,
        successRate: this.performanceHistory.length > 0 ? 
          this.performanceHistory.filter(p => p.success).length / this.performanceHistory.length : 0,
        avgDuration: this.performanceHistory.length > 0 ?
          this.performanceHistory.reduce((sum, p) => sum + p.duration, 0) / this.performanceHistory.length : 0
      }
    };
  }
}

module.exports = { AutonomousLearningSystem };
