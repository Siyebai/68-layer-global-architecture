#!/usr/bin/env node
// ArchitectureEvolutionEngine 集成模块

const EvolutionEngine = require('./autonomous-systems/architecture-evolution-engine');

class ArchitectureEvolutionIntegration {
  constructor() {
    this.engine = null;
    this.enabled = true;
    this.config = {
      analysisInterval: 300000, // 5分钟
      maxArchitectures: 10,
      evolutionDepth: 3
    };
  }
  
  async initialize() {
    console.log('🚀 初始化架构进化引擎...');
    this.engine = new EvolutionEngine();
    await this.engine.initialize();
    console.log('✅ 架构进化引擎就绪');
  }
  
  async start() {
    if (!this.enabled) return;
    await this.initialize();
    
    // 启动分析循环
    setInterval(async () => {
      try {
        const result = await this.engine.analyzeAndEvolve();
        if (result.changes) {
          console.log(`🔧 架构进化: ${result.changes.length}处变更`);
        }
      } catch (err) {
        console.error('架构进化失败:', err.message);
      }
    }, this.config.analysisInterval);
    
    console.log('🔄 架构进化循环已启动');
  }
  
  async getStatus() {
    return {
      enabled: this.enabled,
      engineReady: !!this.engine,
      config: this.config,
      lastUpdate: Date.now()
    };
  }
}

module.exports = ArchitectureEvolutionIntegration;
