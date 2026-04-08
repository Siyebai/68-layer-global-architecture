#!/usr/bin/env node
// 通信模块包装器 - 学习层模块

const { CommunicationModule } = require('./modules/learning/communication');

class AutonomousCommunication {
  constructor(system) {
    this.system = system;
    this.communication = null;
    this.initialized = false;
  }

  async initialize() {
    if (this.initialized) return;
    
    console.log('[AutonomousCommunication] 初始化通信模块...');
    this.communication = new CommunicationModule(this.system);
    await this.communication.initialize();
    this.initialized = true;
    console.log('[AutonomousCommunication] 初始化完成');
  }

  start() {
    if (!this.initialized) {
      console.warn('[AutonomousCommunication] 未初始化，跳过启动');
      return;
    }
    
    console.log('[AutonomousCommunication] 启动通信网络...');
    this.communication.start();
    console.log('[AutonomousCommunication] ✅ 通信模块已启动');
  }

  async getMetrics() {
    if (!this.communication) return { initialized: false };
    return await this.communication.getMetrics();
  }

  async getStatus() {
    if (!this.communication) {
      return { initialized: false, running: false };
    }
    return await this.communication.getStatus();
  }

  // 暴露通信接口
  async shareKnowledge(knowledge, fromAgent) {
    if (this.communication) {
      return await this.communication.shareKnowledge(knowledge, fromAgent);
    }
  }

  async broadcastAlert(message, level) {
    if (this.communication) {
      return await this.communication.broadcastAlert(message, level);
    }
  }
}

module.exports = { AutonomousCommunication };
