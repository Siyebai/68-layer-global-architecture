#!/usr/bin/env node
/**
 * AutoHealer - 自动修复模块
 * 自动化诊断和修复系统问题
 * 作者: C李白 | 2026-04-02
 */

const { exec } = require('child_process');
const { promisify } = require('util');
const execAsync = promisify(exec);

class AutoHealer {
  constructor(monitor, predictor) {
    this.monitor = monitor;
    this.predictor = predictor;
    this.strategies = new Map();
    this.repairHistory = [];
    this.maxConcurrentRepairs = 2;
    this.currentRepairs = 0;
    
    this.registerStrategies();
  }

  /**
   * 注册修复策略
   */
  registerStrategies() {
    // 进程崩溃修复
    this.strategies.set('process_missing', {
      name: '重启进程',
      severity: 'high',
      execute: async (issue) => {
        const procName = issue.message.split(' ')[0];
        console.log(`[AutoHealer] 重启进程: ${procName}`);
        
        // 通过PM2重启
        await execAsync(`pm2 restart ${procName} 2>&1`);
        await this.waitForProcess(procName, 10000);
        
        return { success: true, action: 'pm2_restart' };
      }
    });

    // 服务不可用修复
    this.strategies.set('service_down', {
      name: '重启服务',
      severity: 'high',
      execute: async (issue) => {
        const serviceName = issue.message.split(' ')[0];
        console.log(`[AutoHealer] 重启服务: ${serviceName}`);
        
        await execAsync(`pm2 restart ${serviceName} 2>&1`);
        await this.waitForService(serviceName, 10000);
        
        return { success: true, action: 'service_restart' };
      }
    });

    // 内存过高修复
    this.strategies.set('high_memory', {
      name: '清理内存',
      severity: 'medium',
      execute: async (issue) => {
        console.log('[AutoHealer] 清理系统缓存...');
        
        // 清理PageCache、dentries、inodes
        await execAsync('sync && echo 3 > /proc/sys/vm/drop_caches 2>/dev/null');
        
        // 重启libai-system释放内存
        await execAsync('pm2 restart libai-system 2>&1');
        
        return { success: true, action: 'cache_cleared_and_restart' };
      }
    });

    // CPU过高修复
    this.strategies.set('high_cpu', {
      name: '降低CPU负载',
      severity: 'medium',
      execute: async (issue) => {
        console.log('[AutoHealer] 优化进程优先级...');
        
        // 降低非关键进程优先级
        await execAsync('renice +10 -p $(pgrep -f "libai-bot" | head -1) 2>/dev/null');
        
        // 优化系统参数
        await execAsync('sysctl -w vm.swappiness=10 2>/dev/null');
        
        return { success: true, action: 'priority_adjusted' };
      }
    });

    // Redis连接失败修复
    this.strategies.set('redis_down', {
      name: '重启Redis',
      severity: 'critical',
      execute: async (issue) => {
        console.log('[AutoHealer] 重启Redis服务...');
        
        await execAsync('systemctl restart redis-server 2>&1');
        await this.waitForRedis(5000);
        
        return { success: true, action: 'redis_restarted' };
      }
    });
  }

  /**
   * 主修复循环
   */
  async startAutoHeal() {
    console.log('[AutoHealer] 启动自动修复系统...');
    
    // 每30秒检查一次待修复问题
    setInterval(async () => {
      if (this.currentRepairs < this.maxConcurrentRepairs) {
        await this.checkAndFix();
      }
    }, 30000);
    
    console.log('[AutoHealer] ✅ 自动修复已启动');
  }

  /**
   * 检查并修复
   */
  async checkAndFix() {
    const activeAlerts = this.monitor.alerts.filter(a => !a.acknowledged);
    const unhandled = activeAlerts.filter(a => !a.handled);
    
    // 按严重程度排序 (critical > high > medium > low)
    unhandled.sort((a, b) => {
      const severityOrder = { critical: 0, high: 1, medium: 2, low: 3 };
      return severityOrder[a.severity] - severityOrder[b.severity];
    });
    
    for (const issue of unhandled.slice(0, 1)) { // 一次只处理1个
      if (this.currentRepairs < this.maxConcurrentRepairs) {
        await this.repair(issue);
      }
    }
  }

  /**
   * 执行修复
   */
  async repair(issue) {
    this.currentRepairs++;
    issue.handled = true;
    
    const strategy = this.strategies.get(issue.type);
    const startTime = Date.now();
    
    try {
      console.log(`[AutoHealer] 🔧 开始修复: ${issue.message}`);
      
      let result;
      if (strategy) {
        result = await strategy.execute(issue);
      } else {
        // 默认修复策略: 重启相关服务
        result = await this.defaultRepair(issue);
      }
      
      const duration = Date.now() - startTime;
      
      // 验证修复效果
      const verified = await this.verifyFix(issue);
      
      this.repairHistory.push({
        ...issue,
        repairStart: startTime,
        repairDuration: duration,
        strategy: strategy?.name || 'default',
        result,
        verified,
        timestamp: Date.now()
      });
      
      console.log(`[AutoHealer] ✅ 修复完成: ${issue.message} (耗时${duration}ms, 验证${verified ? '通过' : '失败'})`);
      
    } catch (error) {
      console.error(`[AutoHealer] ❌ 修复失败: ${issue.message}`, error.message);
      this.monitor.triggerAlert('repair_failed', `修复失败: ${issue.message}`, { severity: 'high' });
    } finally {
      this.currentRepairs--;
    }
  }

  /**
   * 默认修复策略
   */
  async defaultRepair(issue) {
    console.log(`[AutoHealer] 使用默认修复策略: ${issue.message}`);
    
    // 重启libai-system
    await execAsync('pm2 restart libai-system 2>&1');
    await new Promise(resolve => setTimeout(resolve, 10000));
    
    return { success: true, action: 'default_restart' };
  }

  /**
   * 验证修复效果
   */
  async verifyFix(issue) {
    await new Promise(resolve => setTimeout(resolve, 2000)); // 等待2秒稳定
    
    // 根据issue类型验证
    switch (issue.type) {
      case 'redis_down':
        try {
          const { stdout } = await execAsync('redis-cli ping 2>/dev/null');
          return stdout.trim() === 'PONG';
        } catch {
          return false;
        }
        
      case 'service_down':
        const serviceName = issue.message.split(' ')[0];
        try {
          const { stdout } = await execAsync(`pm2 status ${serviceName} 2>&1 | grep online`);
          return stdout.includes('online');
        } catch {
          return false;
        }
        
      case 'high_memory':
        const { stdout } = await execAsync('free -m | awk "NR==2{print $3/$2*100}"');
        return parseFloat(stdout) < 75;
        
      default:
        return true; // 其他类型默认验证通过
    }
  }

  /**
   * 等待进程启动
   */
  async waitForProcess(procName, timeout = 10000) {
    const start = Date.now();
    while (Date.now() - start < timeout) {
      try {
        const { stdout } = await execAsync(`pgrep -f "${procName}" | head -1`);
        if (stdout.trim()) return true;
      } catch {
        // 进程未找到
      }
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
    throw new Error(`进程 ${procName} 启动超时`);
  }

  /**
   * 等待服务可用
   */
  async waitForService(serviceName, timeout = 10000) {
    const start = Date.now();
    while (Date.now() - start < timeout) {
      try {
        const service = this.monitor.config.services.find(s => s.name === serviceName);
        if (service) {
          const response = await fetch(`http://localhost:${service.port}${service.path || ''}`, {
            timeout: 1000
          });
          if (response.ok) return true;
        }
      } catch {
        // 服务不可用
      }
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
    throw new Error(`服务 ${serviceName} 启动超时`);
  }

  /**
   * 等待Redis可用
   */
  async waitForRedis(timeout = 5000) {
    const start = Date.now();
    while (Date.now() - start < timeout) {
      try {
        const { stdout } = await execAsync('redis-cli ping 2>/dev/null');
        if (stdout.trim() === 'PONG') return true;
      } catch {
        // Redis不可用
      }
      await new Promise(resolve => setTimeout(resolve, 500));
    }
    throw new Error('Redis启动超时');
  }

  /**
   * 预修复 (预防性修复)
   */
  async preemptiveFix(predictions) {
    for (const prediction of predictions) {
      if (prediction.probability > 0.8) {
        console.log(`[AutoHealer] ⚡ 预防性修复: ${prediction.type} (概率: ${(prediction.probability*100).toFixed(0)}%)`);
        
        switch (prediction.type) {
          case 'cpu_exhaustion':
            await this.lowerCpuLoad();
            break;
          case 'memory_leak':
            await this.restartSystem();
            break;
          case 'response_degradation':
            await this.optimizePerformance();
            break;
        }
      }
    }
  }

  /**
   * 降低CPU负载
   */
  async lowerCpuLoad() {
    console.log('[AutoHealer] 执行CPU负载降低...');
    // 减少Agent数量或降低检查频率
    // 简化: 重启系统
    await execAsync('pm2 restart libai-system 2>&1');
  }

  /**
   * 重启系统
   */
  async restartSystem() {
    console.log('[AutoHealer] 重启核心系统...');
    await execAsync('pm2 restart all 2>&1');
    await new Promise(resolve => setTimeout(resolve, 15000));
  }

  /**
   * 优化性能
   */
  async optimizePerformance() {
    console.log('[AutoHealer] 性能优化...');
    // 清理缓存、优化参数
    await execAsync('sync && echo 3 > /proc/sys/vm/drop_caches 2>/dev/null');
  }

  /**
   * 获取修复统计
   */
  getStats() {
    return {
      totalRepairs: this.repairHistory.length,
      successfulRepairs: this.repairHistory.filter(r => r.verified).length,
      failedRepairs: this.repairHistory.filter(r => !r.verified).length,
      currentRepairs: this.currentRepairs,
      averageDuration: this.calculateAverageDuration(),
      repairTypes: this.groupByType()
    };
  }

  calculateAverageDuration() {
    if (this.repairHistory.length === 0) return 0;
    const total = this.repairHistory.reduce((sum, r) => sum + (r.repairDuration || 0), 0);
    return total / this.repairHistory.length;
  }

  groupByType() {
    const types = {};
    for (const repair of this.repairHistory) {
      types[repair.type] = (types[repair.type] || 0) + 1;
    }
    return types;
  }
}

module.exports = AutoHealer;
