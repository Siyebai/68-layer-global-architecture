#!/usr/bin/env node
// 增强自主监控模块 - 每30秒执行

class AutonomousMonitorEnhanced {
  constructor(system) {
    this.system = system;
    this.interval = 30 * 1000; // 30秒
    this.running = false;
    this.metricsHistory = [];
  }

  start() {
    if (this.running) return;
    this.running = true;
    
    this.monitor().catch(console.error);
    setInterval(() => this.monitor().catch(console.error), this.interval);
    console.log('[AutonomousMonitorEnhanced] 增强监控模块已启动，间隔30秒');
  }

  async monitor() {
    try {
      const status = await this.system.getStatus();
      const metrics = status.metrics;
      
      this.metricsHistory.push({
        timestamp: Date.now(),
        metrics
      });
      
      // 保留最近1000条记录
      if (this.metricsHistory.length > 1000) {
        this.metricsHistory = this.metricsHistory.slice(-1000);
      }
      
      // 检查异常
      this.checkAnomalies(metrics);
      
      // 输出日志
      console.log('[AutonomousMonitorEnhanced] 监控数据:', {
        agents: `${status.agents.healthy}/${status.agents.total}`,
        learning: metrics.learningCycles,
        evolution: metrics.evolutionGenerations,
        iteration: metrics.iterationsCompleted,
        profit: metrics.profit.toFixed(2)
      });
    } catch (err) {
      console.error('[AutonomousMonitorEnhanced] 监控失败:', err.message);
    }
  }

  checkAnomalies(metrics) {
    const anomalies = [];
    
    if (metrics.messagesProcessed === 0 && this.system.state.startTime < Date.now() - 60000) {
      anomalies.push('长时间无消息处理');
    }
    
    if (metrics.errors > 50) {
      anomalies.push('错误数异常升高');
    }
    
    if (anomalies.length > 0) {
      console.warn('[AutonomousMonitorEnhanced] 检测到异常:', anomalies);
    }
  }
}

module.exports = { AutonomousMonitorEnhanced };
