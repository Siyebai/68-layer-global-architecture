// Redis状态存储 - 跨worker共享状态
class RedisStateStore {
  constructor(redis, prefix = 'system:state:') {
    this.redis = redis;
    this.prefix = prefix;
    this.localCache = new Map();
    this.updateInterval = 5000; // 5秒同步一次
  }

  async getMetrics() {
    try {
      const data = await this.redis.hgetall(`${this.prefix}metrics`);
      return {
        messagesProcessed: parseInt(data.messagesProcessed) || 0,
        errors: parseInt(data.errors) || 0,
        tradesExecuted: parseInt(data.tradesExecuted) || 0,
        profit: parseFloat(data.profit) || 0,
        learningCycles: parseInt(data.learningCycles) || 0,
        evolutionGenerations: parseInt(data.evolutionGenerations) || 0,
        iterationsCompleted: parseInt(data.iterationsCompleted) || 0,
        knowledgeBaseSize: parseInt(data.knowledgeBaseSize) || 0,
      };
    } catch (err) {
      console.error('RedisStateStore getMetrics error:', err.message);
      return this.getDefaultMetrics();
    }
  }

  async updateMetrics(metrics) {
    try {
      await this.redis.hmset(`${this.prefix}metrics`, {
        messagesProcessed: metrics.messagesProcessed || 0,
        errors: metrics.errors || 0,
        tradesExecuted: metrics.tradesExecuted || 0,
        profit: metrics.profit || 0,
        learningCycles: metrics.learningCycles || 0,
        evolutionGenerations: metrics.evolutionGenerations || 0,
        iterationsCompleted: metrics.iterationsCompleted || 0,
        knowledgeBaseSize: metrics.knowledgeBaseSize || 0,
        updatedAt: Date.now()
      });
    } catch (err) {
      console.error('RedisStateStore updateMetrics error:', err.message);
    }
  }

  async getEngines() {
    try {
      const data = await this.redis.hgetall(`${this.prefix}engines`);
      return {
        learning: parseInt(data.learning) || 0,
        evolution: parseInt(data.evolution) || 0,
        iteration: parseInt(data.iteration) || 0,
      };
    } catch (err) {
      console.error('RedisStateStore getEngines error:', err.message);
      return { learning: 0, evolution: 0, iteration: 0 };
    }
  }

  async updateEngines(engines) {
    try {
      await this.redis.hmset(`${this.prefix}engines`, {
        learning: engines.learning || 0,
        evolution: engines.evolution || 0,
        iteration: engines.iteration || 0,
        updatedAt: Date.now()
      });
    } catch (err) {
      console.error('RedisStateStore updateEngines error:', err.message);
    }
  }

  getDefaultMetrics() {
    return {
      messagesProcessed: 0,
      errors: 0,
      tradesExecuted: 0,
      profit: 0,
      learningCycles: 0,
      evolutionGenerations: 0,
      iterationsCompleted: 0,
      knowledgeBaseSize: 0,
    };
  }
}

module.exports = { RedisStateStore };
