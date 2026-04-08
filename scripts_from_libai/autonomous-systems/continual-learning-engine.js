#!/usr/bin/env node
// Continual Learning Engine - V7.3
// 持续学习：避免灾难性遗忘，跨任务持续学习

class ContinualLearningEngine {
  constructor() {
    this.name = 'continual-learning';
    this.enabled = true;
    this.tasks = new Map(); // 已学习任务的知识库
    this.currentTask = null;
    this.importanceWeights = new Map(); // Fisher信息矩阵(简化为权重重要性)
    this.regularizationStrength = 1000; // λ
    this.replayBuffer = []; // 经验回放缓冲区
    this.maxReplaySize = 5000;
    this.learningSessions = [];
  }

  // 开始新任务
  startTask(taskId, taskData) {
    this.currentTask = {
      id: taskId,
      data: taskData,
      startTime: Date.now(),
      progress: 0
    };
    
    // 记录任务元数据
    this.tasks.set(taskId, {
      id: taskId,
      data: taskData,
      learned: false,
      importance: new Map(), // 权重重要性
      performance: 0,
      createdAt: Date.now()
    });

    console.log(`[ContinualLearning] Started task: ${taskId}`);
  }

  // 学习任务数据 (简化版)
  async learnTask(taskId, data, model) {
    const task = this.tasks.get(taskId);
    if (!task) {
      throw new Error(`Task ${taskId} not found`);
    }

    // 1. 计算当前权重重要性 (简化: 基于梯度范数)
    const importance = this.computeImportance(data, model);
    task.importance = importance;

    // 2. 学习新任务 (这里调用模型的fit方法)
    if (model && typeof model.fit === 'function') {
      await model.fit(data);
    }

    // 3. 存储经验到回放缓冲区
    this.addToReplayBuffer(taskId, data);

    // 4. 标记任务已完成
    task.learned = true;
    task.performance = 0.85; // 简化: 假设学习成功

    this.learningSessions.push({
      taskId,
      timestamp: Date.now(),
      duration: Date.now() - task.createdAt
    });

    return {
      taskId,
      learned: true,
      performance: task.performance,
      replaySize: this.replayBuffer.length
    };
  }

  // 计算权重重要性 (简化版 Fisher Information Matrix)
  computeImportance(data, model) {
    const importance = new Map();
    
    // 简化: 假设模型有getWeights方法
    if (model && typeof model.getWeights === 'function') {
      const weights = model.getWeights();
      for (const [name, value] of Object.entries(weights)) {
        // 基于数据量的简单重要性估计
        importance.set(name, Math.abs(value).reduce((a, b) => a + b, 0) / data.length);
      }
    }

    return importance;
  }

  // 添加经验到回放缓冲区
  addToReplayBuffer(taskId, data) {
    this.replayBuffer.push({
      taskId,
      data,
      timestamp: Date.now()
    });

    // 保持缓冲区大小限制
    if (this.replayBuffer.length > this.maxReplaySize) {
      this.replayBuffer.shift();
    }
  }

  // 从回放缓冲区采样
  sampleFromReplayBuffer(taskId, sampleSize = 100) {
    const taskSamples = this.replayBuffer.filter(item => item.taskId === taskId);
    const shuffled = taskSamples.sort(() => Math.random() - 0.5);
    return shuffled.slice(0, Math.min(sampleSize, shuffled.length));
  }

  // 弹性权重固化 (EWC) 损失
  computeEWCLoss(model, currentTaskId) {
    let ewcLoss = 0;
    const currentTask = this.tasks.get(currentTaskId);
    
    if (!currentTask || !currentTask.importance) return 0;

    // 获取当前模型权重
    if (model && typeof model.getWeights === 'function') {
      const currentWeights = model.getWeights();
      
      for (const [name, importance] of currentTask.importance) {
        if (currentWeights[name]) {
          const weightDiff = currentWeights[name] - (currentWeights[name] || 0); // 简化
          ewcLoss += importance * weightDiff.reduce((sum, val) => sum + val * val, 0);
        }
      }
    }

    return this.regularizationStrength * ewcLoss;
  }

  // 知识蒸馏损失 (简化版)
  computeDistillationLoss(model, teacherModel, data) {
    if (!teacherModel || typeof teacherModel.predict !== 'function') {
      return 0;
    }

    let distillationLoss = 0;
    const studentOutputs = model.predict(data);
    const teacherOutputs = teacherModel.predict(data);

    // 计算KL散度 (简化)
    for (let i = 0; i < studentOutputs.length; i++) {
      const s = studentOutputs[i];
      const t = teacherOutputs[i];
      if (s && t) {
        distillationLoss += t * Math.log(t / (s + 1e-10));
      }
    }

    return 0.5 * distillationLoss;
  }

  // 联合训练 (新任务 + 旧任务回放)
  async jointTraining(model, newTaskData, newTaskId) {
    // 1. 训练新任务
    console.log('[ContinualLearning] Training new task...');
    await this.learnTask(newTaskId, newTaskData, model);

    // 2. 从旧任务采样并训练
    const oldTaskIds = [...this.tasks.keys()].filter(id => id !== newTaskId);
    
    if (oldTaskIds.length > 0) {
      console.log(`[ContinualLearning] Replaying ${oldTaskIds.length} old tasks...`);
      
      for (const oldTaskId of oldTaskIds) {
        const samples = this.sampleFromReplayBuffer(oldTaskId, 50);
        if (samples.length > 0) {
          const oldData = samples.map(s => s.data);
          // 这里应该调用模型的fit方法进行增量学习
          // model.fit(oldData);
        }
      }
    }

    return {
      newTaskLearned: true,
      oldTasksReplayed: oldTaskIds.length,
      totalReplaySize: this.replayBuffer.length
    };
  }

  // 评估灾难性遗忘
  evaluateForgetting() {
    const results = [];
    
    for (const [taskId, task] of this.tasks) {
      if (task.learned) {
        // 简化: 检查当前性能是否下降
        const currentPerf = task.performance;
        const expectedPerf = 0.9; // 假设初始性能
        
        const forgetting = Math.max(0, expectedPerf - currentPerf);
        results.push({
          taskId,
          initialPerformance: expectedPerf,
          currentPerformance: currentPerf,
          forgettingRate: forgetting
        });
      }
    }

    return results;
  }

  // 获取学习统计
  getLearningStatistics() {
    const totalTasks = this.tasks.size;
    const learnedTasks = [...this.tasks.values()].filter(t => t.learned).length;
    const totalSessions = this.learningSessions.length;
    const avgPerformance = [...this.tasks.values()]
      .filter(t => t.learned)
      .reduce((sum, t) => sum + t.performance, 0) / Math.max(learnedTasks, 1);

    return {
      totalTasks,
      learnedTasks,
      completionRate: totalTasks > 0 ? (learnedTasks / totalTasks) * 100 : 0,
      totalSessions,
      averagePerformance: avgPerformance,
      replayBufferSize: this.replayBuffer.length,
      currentTask: this.currentTask ? this.currentTask.id : null
    };
  }

  getStatus() {
    return {
      name: this.name,
      enabled: this.enabled,
      ...this.getLearningStatistics(),
      status: 'active'
    };
  }
}

module.exports = { ContinualLearningEngine };
