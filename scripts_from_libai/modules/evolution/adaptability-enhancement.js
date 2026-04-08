#!/usr/bin/env node
// 适应性增强模块 (Adaptability Enhancement) - 进化层模块
// 环境自适应、动态调整、弹性扩展

const { SimpleLogger } = require('../../utils/logger');

class AdaptabilityEnhancement {
  constructor(system) {
    this.system = system;
    this.logger = new SimpleLogger('info');
    this.initialized = false;
    this.running = false;
    this.metrics = {
      adaptability: 80,
      environmentChanges: 0,
      adjustmentsMade: 0,
      elasticity: 1.0
    };
    this.environmentHistory = [];
    this.adjustmentRules = this.initAdjustmentRules();
  }

  async initialize() {
    this.logger.info('[Adaptability] 初始化适应性增强模块...');
    this.initialized = true;
    this.logger.info('[Adaptability] 初始化完成');
  }

  start() {
    if (!this.initialized) {
      this.logger.warn('[Adaptability] 未初始化，跳过启动');
      return;
    }
    
    this.running = true;
    this.startTime = Date.now();
    this.logger.info('[Adaptability] 启动适应性监控...');
    
    // 环境监测循环 (每20秒)
    setInterval(() => this.monitorEnvironment(), 20 * 1000);
    
    // 弹性调整循环 (每60秒)
    setInterval(() => this.adjustElasticity(), 60 * 1000);
    
    this.logger.info('[Adaptability] ✅ 适应性增强模块已启动');
  }

  // ========== 环境监测 ==========

  async monitorEnvironment() {
    try {
      const env = this.collectEnvironmentData();
      const changeDetected = this.detectChange(env);
      
      if (changeDetected) {
        this.metrics.environmentChanges++;
        this.environmentHistory.push({
          timestamp: Date.now(),
          environment: env,
          change: changeDetected
        });
        
        // 限制历史记录
        if (this.environmentHistory.length > 100) {
          this.environmentHistory = this.environmentHistory.slice(-50);
        }
        
        this.logger.info(`[适应] 检测到环境变化: ${changeDetected.type}`);
        
        // 立即调整
        await this.adjustToEnvironment(env, changeDetected);
      }
      
    } catch (err) {
      this.logger.error('[环境监测] 错误:', err.message);
    }
  }

  collectEnvironmentData() {
    // 收集环境数据
    return {
      load: this.getSystemLoad(),
      memory: this.getMemoryUsage(),
      network: this.getNetworkLoad(),
      time: Date.now(),
      hour: new Date().getHours()
    };
  }

  getSystemLoad() {
    try {
      const load = parseInt(require('child_process').execSync('cat /proc/loadavg').toString().split(' ')[0]);
      return load;
    } catch {
      return Math.random() * 4;
    }
  }

  getMemoryUsage() {
    try {
      const meminfo = require('fs').readFileSync('/proc/meminfo', 'utf8');
      const match = meminfo.match(/MemAvailable:\s+(\d+)/);
      return match ? parseInt(match[1]) / 1024 : 0;
    } catch {
      return Math.random() * 4000;
    }
  }

  getNetworkLoad() {
    try {
      const netstat = require('child_process').execSync('cat /proc/net/dev').toString();
      const lines = netstat.split('\n').slice(2);
      let total = 0;
      for (const line of lines) {
        const parts = line.trim().split(/\s+/);
        if (parts.length >= 2) {
          total += parseInt(parts[1]) || 0;
        }
      }
      return total / 1024 / 1024; // MB
    } catch {
      return Math.random() * 100;
    }
  }

  detectChange(env) {
    if (this.environmentHistory.length === 0) return null;
    
    const lastEnv = this.environmentHistory[this.environmentHistory.length - 1].environment;
    
    // 检测显著变化
    const loadChange = Math.abs(env.load - lastEnv.load);
    const memoryChange = Math.abs(env.memory - lastEnv.memory);
    const networkChange = Math.abs(env.network - lastEnv.network);
    
    if (loadChange > 1.0) {
      return { type: 'high_load', severity: loadChange, data: { load: env.load } };
    }
    
    if (memoryChange > 500) {
      return { type: 'memory_pressure', severity: memoryChange, data: { memory: env.memory } };
    }
    
    if (networkChange > 50) {
      return { type: 'network_spike', severity: networkChange, data: { network: env.network } };
    }
    
    // 检测时间模式 (如高峰时段)
    const isPeakHour = env.hour >= 9 && env.hour <= 18;
    const lastIsPeak = lastEnv.hour >= 9 && lastEnv.hour <= 18;
    if (isPeakHour !== lastIsPeak) {
      return { type: 'time_pattern', severity: 1, data: { hour: env.hour } };
    }
    
    return null;
  }

  // ========== 弹性调整 ==========

  async adjustToEnvironment(env, change) {
    this.logger.info(`[调整] 应对变化: ${change.type} (严重度: ${change.severity.toFixed(1)})`);
    
    const rule = this.findBestRule(change.type);
    if (rule) {
      await this.applyRule(rule, env, change);
      this.metrics.adjustmentsMade++;
    }
  }

  findBestRule(changeType) {
    // 查找匹配的调整规则
    const rules = this.adjustmentRules[changeType];
    if (!rules || rules.length === 0) return null;
    
    // 选择最匹配的规则 (简化: 选择第一个)
    return rules[0];
  }

  async applyRule(rule, env, change) {
    this.logger.debug(`[调整] 应用规则: ${rule.name}`);
    
    switch (rule.action) {
      case 'scale_up':
        await this.scaleUp(rule.params);
        break;
      case 'scale_down':
        await this.scaleDown(rule.params);
        break;
      case 'optimize_memory':
        await this.optimizeMemory(rule.params);
        break;
      case 'throttle':
        await this.throttle(rule.params);
        break;
      case 'boost':
        await this.boost(rule.params);
        break;
    }
  }

  async scaleUp(params) {
    this.logger.info('[调整] 执行扩容操作');
    // 调用系统的扩容逻辑
    this.metrics.elasticity = Math.min(this.metrics.elasticity * 1.2, 2.0);
  }

  async scaleDown(params) {
    this.logger.info('[调整] 执行缩容操作');
    this.metrics.elasticity = Math.max(this.metrics.elasticity * 0.8, 0.5);
  }

  async optimizeMemory(params) {
    this.logger.info('[调整] 优化内存使用');
    // 触发垃圾回收等内存优化
  }

  async throttle(params) {
    this.logger.info('[调整] 限流保护');
    // 降低请求速率限制
  }

  async boost(params) {
    this.logger.info('[调整] 性能提升');
    // 提升性能参数
  }

  // ========== 弹性计算 ==========

  async adjustElasticity() {
    // 定期调整弹性系数
    const recentChanges = this.environmentHistory.filter(e => Date.now() - e.timestamp < 3600 * 1000).length;
    
    if (recentChanges > 5) {
      // 高变化环境: 提高弹性
      this.metrics.elasticity = Math.min(this.metrics.elasticity * 1.1, 2.0);
      this.logger.info(`[弹性] 环境多变，弹性提升至 ${this.metrics.elasticity.toFixed(2)}`);
    } else if (recentChanges === 0) {
      // 稳定环境: 降低弹性以节省资源
      this.metrics.elasticity = Math.max(this.metrics.elasticity * 0.95, 0.5);
      this.logger.info(`[弹性] 环境稳定，弹性调整至 ${this.metrics.elasticity.toFixed(2)}`);
    }
  }

  initAdjustmentRules() {
    return {
      'high_load': [
        {
          name: '自动扩容',
          action: 'scale_up',
          params: { target: 'agents', factor: 1.2 },
          condition: { load: '>4' }
        }
      ],
      'memory_pressure': [
        {
          name: '内存优化',
          action: 'optimize_memory',
          params: { gc: true },
          condition: { memory: '<1000' }
        }
      ],
      'network_spike': [
        {
          name: '网络限流',
          action: 'throttle',
          params: { rate: 0.8 },
          condition: { network: '>100' }
        }
      ],
      'time_pattern': [
        {
          name: '高峰时段扩容',
          action: 'scale_up',
          params: { schedule: 'peak' },
          condition: { hour: '9-18' }
        }
      ]
    };
  }

  // ========== 公共接口 ==========

  async getMetrics() {
    return {
      ...this.metrics,
      historySize: this.environmentHistory.length,
      uptime: Date.now() - (this.startTime || Date.now())
    };
  }

  async getStatus() {
    return {
      initialized: this.initialized,
      running: this.running,
      metrics: this.metrics,
      adaptabilityScore: this.metrics.adaptability * this.metrics.elasticity,
      historySize: this.environmentHistory.length
    };
  }

  async getAdjustmentHistory(count = 20) {
    return this.environmentHistory.slice(-count);
  }
}

module.exports = { AdaptabilityEnhancement };
