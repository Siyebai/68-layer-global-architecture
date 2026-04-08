#!/usr/bin/env node
// 状态同步器 - 定期将本地状态同步到Redis

const { RedisStateStore } = require('./redis-state-store');

class StateSync {
  constructor(system, redis) {
    this.system = system;
    this.redis = redis;
    this.store = new RedisStateStore(redis);
    this.interval = 5000; // 5秒
    this.running = false;
  }

  start() {
    if (this.running) return;
    this.running = true;
    
    // 立即同步一次
    this.sync().catch(console.error);
    
    // 定期同步
    setInterval(() => this.sync().catch(console.error), this.interval);
    console.log('[StateSync] 状态同步器已启动，间隔5秒');
  }

  async sync() {
    try {
      if (!this.system || !this.system.state || !this.system.learningEngine) {
        return;
      }

      // 收集指标
      const metrics = {
        messagesProcessed: this.system.state.metrics.messagesProcessed || 0,
        errors: this.system.state.metrics.errors || 0,
        tradesExecuted: this.system.state.metrics.tradesExecuted || 0,
        profit: this.system.state.metrics.profit || 0,
        learningCycles: this.system.state.metrics.learningCycles || 0,
        evolutionGenerations: this.system.evolutionEngine ? (this.system.evolutionEngine.generation || 0) : 0,
        iterationsCompleted: this.system.state.metrics.iterationsCompleted || 0,
        knowledgeBaseSize: this.system.learningEngine && this.system.learningEngine.knowledgeBase ? (this.system.learningEngine.knowledgeBase.size || 0) : 0,
      };

      // 收集引擎状态
      const engines = {
        learning: metrics.knowledgeBaseSize,
        evolution: metrics.evolutionGenerations,
        iteration: metrics.iterationsCompleted
      };

      // 写入Redis
      await this.store.updateMetrics(metrics);
      await this.store.updateEngines(engines);
    } catch (err) {
      console.error('[StateSync] 同步失败:', err.message);
    }
  }
}

module.exports = { StateSync };
