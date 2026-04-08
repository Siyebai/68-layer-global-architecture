#!/usr/bin/env node
// 极速响应系统包装器
const { RapidResponseSystem } = require('./rapid-response-system');

class AutonomousRapidResponse {
  constructor(system) {
    this.system = system;
    this.rapid = null;
    this.initialized = false;
  }

  async initialize() {
    if (this.initialized) return;
    console.log('[RapidResponse] 初始化极速响应系统...');
    this.rapid = new RapidResponseSystem({
      detectionInterval: 10,
      analysisTimeout: 5,
      executionTimeout: 1,
      recoveryTimeout: 10
    });
    await this.rapid.initialize();
    this.initialized = true;
    console.log('[RapidResponse] 初始化完成');
  }

  start() {
    if (!this.initialized) {
      console.warn('[RapidResponse] 未初始化，跳过启动');
      return;
    }
    this.rapid.start();
    console.log('[RapidResponse] ✅ 极速响应系统已启动');
  }

  async getStatus() {
    if (!this.rapid) return { initialized: false, running: false };
    return this.rapid.getStatus();
  }

  async getMetrics() {
    if (!this.rapid) return {};
    return this.rapid.getStats();
  }
}

module.exports = { AutonomousRapidResponse };
