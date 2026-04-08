#!/usr/bin/env node
/**
 * 监控系统适配器
 * 收集系统指标并发送到监控面板
 */

const os = require('os');
const fs = require('fs');
const path = require('path');

class MonitoringAdapter {
  constructor(config = {}) {
    this.config = {
      enabled: config.enabled !== false,
      metricsInterval: config.metricsInterval || 30000,
      metricsHistory: config.metricsHistory || 1000,
      ...config
    };
    this.stats = {
      metricsCollected: 0,
      alertsTriggered: 0,
      reportsGenerated: 0
    };
    this.metricsHistory = [];
    this.thresholds = {
      cpu: 80,      // CPU使用率阈值 %
      memory: 85,   // 内存使用率阈值 %
      latency: 100, // 延迟阈值 ms
      errorRate: 0.05 // 错误率阈值 5%
    };
  }

  async handleMessage(msg) {
    if (!this.config.enabled) return { disabled: true };
    
    const content = msg.content;
    
    // 处理监控相关消息
    if (content.type === 'metrics' || content.metrics) {
      return await this.processMetrics(content, msg);
    } else if (content.type === 'health_check' || content.health) {
      return await this.processHealthCheck(content, msg);
    } else if (content.type === 'alert' || content.alert) {
      return await this.processAlert(content, msg);
    }
    
    // 收集系统自动指标
    const autoMetrics = this.collectSystemMetrics();
    this.storeMetrics(autoMetrics);
    
    return { collected: true, metricsCount: this.metricsHistory.length };
  }

  async processMetrics(data, sourceMsg) {
    const metrics = {
      timestamp: new Date().toISOString(),
      source: sourceMsg.from,
      ...data.metrics
    };
    
    this.storeMetrics(metrics);
    this.checkThresholds(metrics);
    
    return { processed: true, metricsId: metrics.timestamp };
  }

  async processHealthCheck(data, sourceMsg) {
    const health = {
      timestamp: new Date().toISOString(),
      agent: sourceMsg.from,
      status: data.status || 'healthy',
      uptime: data.uptime || os.uptime(),
      metrics: this.collectSystemMetrics()
    };
    
    // 健康检查不存储到历史，直接处理
    if (health.status !== 'healthy') {
      await this.triggerAlert('health_check_failed', health);
    }
    
    return { checked: true, healthy: health.status === 'healthy' };
  }

  async processAlert(data, sourceMsg) {
    this.stats.alertsTriggered++;
    
    const alert = {
      id: `alert-${Date.now()}`,
      timestamp: new Date().toISOString(),
      source: sourceMsg.from,
      level: data.level || 'warning',
      message: data.message || data.alert,
      details: data.details || {}
    };
    
    console.warn(`[Monitoring] 告警触发 [${alert.level}]:`, alert.message);
    
    // 存储告警
    this.logAlert(alert);
    
    // 发送告警到通信系统
    this.emit('alert_triggered', alert);
    
    return { triggered: true, alertId: alert.id };
  }

  collectSystemMetrics() {
    const cpus = os.cpus();
    const totalMem = os.totalmem();
    const freeMem = os.freemem();
    const usedMem = totalMem - freeMem;
    
    // 计算平均CPU使用率
    let totalIdle = 0;
    let totalTick = 0;
    cpus.forEach(cpu => {
      for (let type in cpu.times) {
        totalTick += cpu.times[type];
      }
      totalIdle += cpu.times.idle;
    });
    const cpuUsage = 100 - (totalIdle / totalTick * 100);
    
    return {
      cpu: {
        usage: Math.round(cpuUsage * 10) / 10,
        cores: cpus.length,
        loadAvg: os.loadavg()[0] || 0
      },
      memory: {
        total: totalMem,
        used: usedMem,
        free: freeMem,
        usage: Math.round((usedMem / totalMem) * 1000) / 10
      },
      network: this.getNetworkStats(),
      disk: this.getDiskStats(),
      process: {
        memory: process.memoryUsage(),
        uptime: os.uptime()
      }
    };
  }

  getNetworkStats() {
    // 简化的网络统计（实际可以使用更专业的库）
    const interfaces = os.networkInterfaces();
    let totalRx = 0, totalTx = 0;
    
    for (let name in interfaces) {
      for (let iface of interfaces[name]) {
        if (!iface.internal) {
          // 这里无法获取实时流量，仅返回接口数量
          totalRx++;
          totalTx++;
        }
      }
    }
    
    return { interfaces: totalRx };
  }

  getDiskStats() {
    try {
      const stats = fs.statvfsSync('/');
      const free = stats.f_bavail * stats.f_frsize;
      const total = stats.f_blocks * stats.f_frsize;
      const used = total - free;
      
      return {
        total,
        used,
        free,
        usage: Math.round((used / total) * 1000) / 10
      };
    } catch (e) {
      return { error: e.message };
    }
  }

  storeMetrics(metrics) {
    this.metricsHistory.push(metrics);
    
    // 限制历史记录大小
    if (this.metricsHistory.length > this.config.metricsHistory) {
      this.metricsHistory.shift();
    }
    
    this.stats.metricsCollected++;
  }

  checkThresholds(metrics) {
    const alerts = [];
    
    if (metrics.cpu.usage > this.thresholds.cpu) {
      alerts.push({
        level: 'warning',
        message: `CPU使用率过高: ${metrics.cpu.usage}% (阈值: ${this.thresholds.cpu}%)`,
        metric: 'cpu'
      });
    }
    
    if (metrics.memory.usage > this.thresholds.memory) {
      alerts.push({
        level: 'warning',
        message: `内存使用率过高: ${metrics.memory.usage}% (阈值: ${this.thresholds.memory}%)`,
        metric: 'memory'
      });
    }
    
    // 检查趋势（CPU/内存连续上升）
    if (this.metricsHistory.length >= 5) {
      const recent = this.metricsHistory.slice(-5);
      const cpuTrend = this.calculateTrend(recent.map(m => m.cpu.usage));
      const memTrend = this.calculateTrend(recent.map(m => m.memory.usage));
      
      if (cpuTrend > 0.5) {
        alerts.push({
          level: 'info',
          message: `CPU使用率持续上升 (趋势: +${cpuTrend.toFixed(2)}%)`,
          metric: 'cpu_trend'
        });
      }
      
      if (memTrend > 0.5) {
        alerts.push({
          level: 'info',
          message: `内存使用率持续上升 (趋势: +${memTrend.toFixed(2)}%)`,
          metric: 'memory_trend'
        });
      }
    }
    
    // 触发告警
    for (const alert of alerts) {
      this.triggerAlert(alert.metric, {
        level: alert.level,
        message: alert.message,
        currentValue: metrics[alert.metric] || metrics.cpu[alert.metric] || metrics.memory[alert.metric]
      });
    }
  }

  calculateTrend(values) {
    if (values.length < 2) return 0;
    const n = values.length;
    const xMean = (n - 1) / 2;
    const yMean = values.reduce((a, b) => a + b, 0) / n;
    
    let numerator = 0;
    let denominator = 0;
    
    for (let i = 0; i < n; i++) {
      numerator += (i - xMean) * (values[i] - yMean);
      denominator += (i - xMean) ** 2;
    }
    
    return denominator === 0 ? 0 : numerator / denominator;
  }

  async triggerAlert(metric, data) {
    this.stats.alertsTriggered++;
    
    const alert = {
      type: 'alert',
      content: {
        metric,
        ...data,
        timestamp: new Date().toISOString()
      }
    };
    
    console.warn(`[Monitoring] 告警: ${data.message}`);
    
    // 通过事件发送到通信系统
    this.emit('alert', alert);
  }

  logAlert(alert) {
    const logDir = path.join(this.config.storagePath, 'alerts');
    if (!fs.existsSync(logDir)) fs.mkdirSync(logDir, { recursive: true });
    
    const filename = path.join(logDir, `${alert.id}.json`);
    fs.writeFileSync(filename, JSON.stringify(alert, null, 2));
  }

  generateReport() {
    const now = new Date();
    const period = 3600000; // 1小时
    const recentMetrics = this.metricsHistory.filter(m => 
      now - new Date(m.timestamp) < period
    );
    
    if (recentMetrics.length === 0) {
      return { empty: true };
    }
    
    const avgCpu = recentMetrics.reduce((sum, m) => sum + m.cpu.usage, 0) / recentMetrics.length;
    const avgMem = recentMetrics.reduce((sum, m) => sum + m.memory.usage, 0) / recentMetrics.length;
    
    return {
      period: '1小时',
      metricsCount: recentMetrics.length,
      averages: {
        cpu: Math.round(avgCpu * 10) / 10,
        memory: Math.round(avgMem * 10) / 10
      },
      peaks: {
        cpu: Math.max(...recentMetrics.map(m => m.cpu.usage)),
        memory: Math.max(...recentMetrics.map(m => m.memory.usage))
      },
      alerts: this.stats.alertsTriggered,
      generatedAt: now.toISOString()
    };
  }

  getStats() {
    return {
      ...this.stats,
      metricsInHistory: this.metricsHistory.length,
      thresholds: this.thresholds,
      lastReport: this.generateReport()
    };
  }
}

module.exports = MonitoringAdapter;
