#!/usr/bin/env node
// 增强版自主学习模块 - 每5分钟执行

class AutonomousLearningEnhanced {
  constructor(system) {
    this.system = system;
    this.interval = 5 * 60 * 1000; // 5分钟
    this.running = false;
  }

  start() {
    if (this.running) return;
    this.running = true;
    
    this.learn().catch(console.error);
    setInterval(() => this.learn().catch(console.error), this.interval);
    console.log('[AutonomousLearningEnhanced] 增强学习模块已启动，间隔5分钟');
  }

  async learn() {
    try {
      const engine = this.system.learningEngine;
      if (!engine || !engine.trainingData || engine.trainingData.length < 100) {
        console.log('[AutonomousLearningEnhanced] 数据不足，跳过本次学习');
        return;
      }

      // 1. 提取知识
      const knowledge = await this.extractKnowledge(engine.trainingData);
      
      // 2. 更新知识库
      await this.updateKnowledgeBase(knowledge);
      
      // 3. 训练模型 (简化)
      await this.trainModel(knowledge);
      
      // 4. 清空已处理数据
      engine.trainingData = [];
      
      // 5. 更新指标
      this.system.state.metrics.learningCycles++;
      
      // 6. 同步到Redis
      if (this.system.stateSync) this.system.stateSync.sync();
      
      console.log('[AutonomousLearningEnhanced] 学习周期完成:', {
        cycles: this.system.state.metrics.learningCycles,
        knowledgeSize: engine.knowledgeBase.size
      });
    } catch (err) {
      console.error('[AutonomousLearningEnhanced] 学习失败:', err.message);
    }
  }

  async extractKnowledge(data) {
    // 简化的知识提取
    const patterns = [];
    for (const item of data) {
      if (item.profit) {
        patterns.push({
          symbol: item.symbol,
          strategy: item.strategy,
          profitable: item.profit > 0,
          profit: item.profit
        });
      }
    }
    return patterns;
  }

  async updateKnowledgeBase(knowledge) {
    const engine = this.system.learningEngine;
    for (const item of knowledge) {
      const key = `${item.symbol}-${item.strategy}`;
      if (!engine.knowledgeBase.has(key)) {
        engine.knowledgeBase.set(key, []);
      }
      engine.knowledgeBase.get(key).push({
        profitable: item.profitable,
        profit: item.profit,
        timestamp: Date.now()
      });
    }
  }

  async trainModel(knowledge) {
    // 这里可以集成真实的ML模型训练
    console.log('[AutonomousLearningEnhanced] 模型训练 (模拟)');
  }
}

module.exports = { AutonomousLearningEnhanced };
