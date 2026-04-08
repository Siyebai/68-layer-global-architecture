#!/usr/bin/env node
// 自主修复模块 - 每2分钟执行

class AutonomousHealing {
  constructor(system) {
    this.system = system;
    this.interval = 2 * 60 * 1000; // 2分钟
    this.running = false;
    this.healthHistory = [];
  }

  start() {
    if (this.running) return;
    this.running = true;
    
    this.check().catch(console.error);
    setInterval(() => this.check().catch(console.error), this.interval);
    console.log('[AutonomousHealing] 自主修复模块已启动，间隔2分钟');
  }

  async check() {
    try {
      const health = await this.assessHealth();
      this.healthHistory.push(health);
      
      if (health.status !== 'healthy') {
        console.log('[AutonomousHealing] 检测到问题:', health.issues);
        await this.heal(health);
      }
    } catch (err) {
      console.error('[AutonomousHealing] 健康检查失败:', err.message);
    }
  }

  // V7.2兼容接口
  async detectAndHeal() {
    await this.check();
  }

  async assessHealth() {
    const issues = [];
    
    // 检查Redis
    try {
      const ping = await this.system.redis.ping();
      if (ping !== 'PONG') issues.push('Redis连接失败');
    } catch (e) {
      issues.push('Redis异常: ' + e.message);
    }
    
    // 检查Agent数量
    const status = await this.system.getStatus();
    if (status.agents.healthy < status.agents.total * 0.9) {
      issues.push(`Agent数量不足: ${status.agents.healthy}/${status.agents.total}`);
    }
    
    // 检查错误率
    if (status.metrics.errors > 100) {
      issues.push(`错误率过高: ${status.metrics.errors}`);
    }
    
    return {
      timestamp: Date.now(),
      status: issues.length === 0 ? 'healthy' : 'unhealthy',
      issues,
      metrics: status.metrics
    };
  }

  async heal(health) {
    console.log('[AutonomousHealing] 开始修复...');
    
    for (const issue of health.issues) {
      if (issue.includes('Redis')) {
        await this.fixRedis();
      } else if (issue.includes('Agent')) {
        await this.restartAgents();
      } else if (issue.includes('错误')) {
        await this.clearErrors();
      }
    }
  }

  async fixRedis() {
    try {
      await this.system.redis.quit();
      await new Promise(resolve => setTimeout(resolve, 2000));
      // 重新连接逻辑由系统自动处理
      console.log('[AutonomousHealing] Redis连接已重置');
    } catch (e) {
      console.error('[AutonomousHealing] Redis修复失败:', e.message);
    }
  }

  async restartAgents() {
    // 重启失败的Agent
    console.log('[AutonomousHealing] 重启Agent逻辑待实现');
  }

  async clearErrors() {
    // 清理错误状态
    this.system.state.metrics.errors = 0;
    if (this.system.stateSync) this.system.stateSync.sync();
    console.log('[AutonomousHealing] 错误计数已重置');
  }
}

module.exports = { AutonomousHealing };
