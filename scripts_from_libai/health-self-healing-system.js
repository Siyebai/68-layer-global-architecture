#!/usr/bin/env node
/**
 * HealthSelfHealingSystem - 系统健康自愈主系统
 * 集成监控、预测、修复、优化、防护五大模块
 * 作者: C李白 | 2026-04-02
 */

const HealthMonitor = require('./modules/health-monitor');
const FaultPredictor = require('./modules/fault-predictor');
const AutoHealer = require('./modules/auto-healer');
const PerformanceOptimizer = require('./modules/performance-optimizer');
const SecurityGuard = require('./modules/security-guard');

class HealthSelfHealingSystem {
  constructor(v72System) {
    this.v72System = v72System;
    this.initialized = false;
    this.monitor = null;
    this.predictor = null;
    this.healer = null;
    this.optimizer = null;
    this.security = null;
  }

  /**
   * 初始化健康自愈系统
   */
  async initialize() {
    console.log('\n🏥 初始化系统健康自愈系统...');
    
    // 1. 创建监控器
    this.monitor = new HealthMonitor();
    
    // 2. 创建预测器 (依赖监控器)
    this.predictor = new FaultPredictor(this.monitor);
    
    // 3. 创建自动修复器 (依赖监控器和预测器)
    this.healer = new AutoHealer(this.monitor, this.predictor);
    
    // 4. 创建性能优化器 (依赖监控器)
    this.optimizer = new PerformanceOptimizer(this.monitor);
    
    // 5. 创建安全防护器 (依赖监控器)
    this.security = new SecurityGuard(this.monitor);
    
    // 6. 连接到V72系统
    this.connectToV72();
    
    // 7. 启动所有模块
    this.startAll();
    
    this.initialized = true;
    console.log('✅ 健康自愈系统已完全启动');
  }

  /**
   * 连接到V7.2系统
   */
  connectToV72() {
    console.log('[HealthSelfHealing] 连接到V7.2系统...');
    
    // 将健康系统状态暴露给V7.2
    if (this.v72System) {
      this.v72System.healthSystem = this;
      
      // 注册健康检查API
      this.v72System.getHealthStatus = () => this.getHealthStatus();
      this.v72System.getHealthRecommendations = () => this.getRecommendations();
      
      console.log('[HealthSelfHealing] 已集成到V7.2系统');
    }
  }

  /**
   * 启动所有模块
   */
  startAll() {
    console.log('[HealthSelfHealing] 启动所有子模块...');
    
    // 启动监控
    this.monitor.start();
    
    // 启动自动修复
    this.healer.startAutoHeal();
    
    // 启动性能优化
    this.optimizer.start();
    
    // 启动安全防护
    this.security.start();
    
    // 启动预测驱动的预防性修复
    setInterval(() => this.preemptiveCheck(), 2 * 60 * 1000); // 每2分钟
    
    console.log('[HealthSelfHealing] 所有模块已启动');
  }

  /**
   * 预防性检查 (基于预测)
   */
  async preemptiveCheck() {
    try {
      const predictions = this.predictor.getHighRiskPredictions();
      if (predictions.length > 0) {
        console.log(`[HealthSelfHealing] 🔮 发现 ${predictions.length} 个高风险预测`);
        await this.healer.preemptiveFix(predictions);
      }
    } catch (error) {
      console.error('[HealthSelfHealing] 预防性检查失败:', error);
    }
  }

  /**
   * 获取健康状态摘要
   */
  getHealthStatus() {
    if (!this.initialized) {
      return { initialized: false, message: '系统未初始化' };
    }

    const monitorSummary = this.monitor.getSummary();
    const predictorStats = this.predictor ? { accuracy: this.predictor.evaluateAccuracy() } : {};
    const healerStats = this.healer.getStats();
    const optimizerStats = this.optimizer.getStats();
    const securityStats = this.security.getStats();

    return {
      initialized: true,
      uptime: Date.now() - this.monitor.startTime,
      healthy: monitorSummary.healthy,
      timestamp: Date.now(),
      monitor: monitorSummary,
      predictor: predictorStats,
      healer: healerStats,
      optimizer: optimizerStats,
      security: securityStats,
      metrics: this.calculateOverallMetrics()
    };
  }

  /**
   * 计算总体指标
   */
  calculateOverallMetrics() {
    const activeAlerts = this.monitor.alerts.filter(a => !a.acknowledged && Date.now() - a.timestamp < 10 * 60 * 1000);
    const repairSuccessRate = this.healer.repairHistory.length > 0 
      ? this.healer.repairHistory.filter(r => r.verified).length / this.healer.repairHistory.length 
      : 1;
    
    return {
      availability: this.calculateAvailability(),
      meanTimeToRecovery: this.healer.calculateAverageDuration(),
      predictionAccuracy: this.predictor.evaluateAccuracy(),
      repairSuccessRate,
      securityIncidents: this.security.threats.length,
      optimizationCount: this.optimizer.optimizationHistory.length,
      activeAlerts: activeAlerts.length
    };
  }

  /**
   * 计算可用性
   */
  calculateAvailability() {
    const uptime = Date.now() - this.monitor.startTime;
    const totalDowntime = this.healer.repairHistory.reduce((sum, r) => sum + (r.repairDuration || 0), 0);
    return ((uptime - totalDowntime) / uptime) * 100;
  }

  /**
   * 获取建议 (用于V35.0自主决策)
   */
  getRecommendations() {
    const alerts = this.monitor.alerts.filter(a => !a.acknowledged);
    const predictions = this.predictor.predict();
    
    return {
      immediate: alerts.slice(0, 5).map(a => ({
        type: 'alert',
        severity: a.severity,
        message: a.message,
        suggestedAction: this.suggestAction(a.type)
      })),
      predictive: predictions.slice(0, 3).map(p => ({
        type: 'prediction',
        issue: p.type,
        probability: p.probability,
        timeToFailure: p.timeToFailure,
        suggestedAction: this.suggestPreventiveAction(p.type)
      })),
      optimizations: this.optimizer.optimizationHistory.slice(-3)
    };
  }

  /**
   * 建议修复动作
   */
  suggestAction(alertType) {
    const actions = {
      'process_missing': 'pm2 restart <process>',
      'service_down': 'pm2 restart <service>',
      'high_memory': '清理缓存并重启服务',
      'high_cpu': '调整进程优先级',
      'redis_down': 'systemctl restart redis-server',
      'postgresql_down': 'systemctl restart postgresql'
    };
    return actions[alertType] || '检查相关服务并重启';
  }

  /**
   * 建议预防性动作
   */
  suggestPreventiveAction(predictionType) {
    const actions = {
      'cpu_exhaustion': '降低检查频率或增加资源',
      'memory_leak': '重启服务并分析内存泄漏',
      'response_degradation': '优化数据库查询和缓存'
    };
    return actions[predictionType] || '监控并准备资源扩容';
  }

  /**
   * 获取状态 (供V7.2 getStatus调用)
   */
  getStatus() {
    const health = this.getHealthStatus();
    return {
      name: 'health-self-healing',
      running: this.initialized,
      version: '1.0.0',
      stats: {
        uptime: health.uptime,
        healthy: health.healthy,
        activeAlerts: health.monitor.activeAlerts,
        totalRepairs: this.healer.repairHistory.length,
        successfulRepairs: this.healer.repairHistory.filter(r => r.verified).length,
        predictionAccuracy: health.predictor.accuracy,
        availability: health.metrics.availability,
        securityIncidents: this.security.threats.length,
        optimizations: this.optimizer.optimizationHistory.length
      },
      modules: {
        monitor: this.monitor ? 'active' : 'inactive',
        predictor: this.predictor ? 'active' : 'inactive',
        healer: this.healer ? 'active' : 'inactive',
        optimizer: this.optimizer ? 'active' : 'inactive',
        security: this.security ? 'active' : 'inactive'
      }
    };
  }

  /**
   * 手动触发健康检查
   */
  async triggerManualCheck() {
    console.log('[HealthSelfHealing] 手动触发健康检查...');
    await this.monitor.runFullCheck();
    return this.getHealthStatus();
  }

  /**
   * 手动确认告警
   */
  acknowledgeAlert(alertId) {
    const alert = this.monitor.alerts.find(a => a.id === alertId);
    if (alert) {
      alert.acknowledged = true;
      return true;
    }
    return false;
  }

  /**
   * 获取告警列表
   */
  getActiveAlerts() {
    return this.monitor.alerts.filter(a => !a.acknowledged);
  }
}

module.exports = HealthSelfHealingSystem;
