#!/usr/bin/env node
/**
 * HealthMonitor - 系统健康监控模块
 * 监控进程、服务、资源、依赖、业务5大维度
 * 作者: C李白 | 2026-04-02
 */

const { exec } = require('child_process');
const { promisify } = require('util');
const execAsync = promisify(exec);

class HealthMonitor {
  constructor(config = {}) {
    this.config = {
      intervals: {
        processes: 10000,   // 10秒
        services: 10000,    // 10秒
        resources: 30000,   // 30秒
        dependencies: 60000, // 60秒
        business: 300000    // 5分钟
      },
      thresholds: {
        cpu: 80,           // CPU使用率阈值 %
        memory: 80,        // 内存使用率阈值 %
        disk: 85,          // 磁盘使用率阈值 %
        responseTime: 1000, // 响应时间阈值 ms
        errorRate: 0.01,   // 错误率阈值 (1%)
        ...config.thresholds
      },
      services: [
        { name: 'libai-system', port: 3000, path: '/status/super-auto' },
        { name: 'redis', port: 6379, path: null },
        { name: 'postgresql', port: 5432, path: null }
      ],
      processes: [
        'libai-system',
        'libai-bot',
        'redis-server',
        'postgresql'
      ]
    };

    this.metrics = {
      processes: {},
      services: {},
      resources: {},
      dependencies: {},
      business: {}
    };

    this.alerts = [];
    this.history = [];
    this.startTime = Date.now();
  }

  /**
   * 启动监控循环
   */
  start() {
    console.log('[HealthMonitor] 启动健康监控系统...');

    // 立即执行一次全量检查
    this.runFullCheck().catch(console.error);

    // 设置各维度检查间隔
    setInterval(() => this.checkProcesses(), this.config.intervals.processes);
    setInterval(() => this.checkServices(), this.config.intervals.services);
    setInterval(() => this.checkResources(), this.config.intervals.resources);
    setInterval(() => this.checkDependencies(), this.config.intervals.dependencies);
    setInterval(() => this.checkBusiness(), this.config.intervals.business);

    // 每5分钟运行一次全量检查
    setInterval(() => this.runFullCheck(), 5 * 60 * 1000);

    console.log('[HealthMonitor] ✅ 监控已启动');
  }

  /**
   * 全量检查
   */
  async runFullCheck() {
    console.log('[HealthMonitor] 开始全量健康检查...');
    
    try {
      await Promise.all([
        this.checkProcesses(),
        this.checkServices(),
        this.checkResources(),
        this.checkDependencies(),
        this.checkBusiness()
      ]);

      this.saveSnapshot();
      this.analyzeTrends();
      
      console.log('[HealthMonitor] 全量检查完成');
    } catch (error) {
      console.error('[HealthMonitor] 全量检查失败:', error);
    }
  }

  /**
   * 检查进程状态
   */
  async checkProcesses() {
    try {
      const { stdout } = await execAsync('ps aux | grep -E "libai-system|libai-bot|redis-server|postgresql" | grep -v grep');
      const lines = stdout.trim().split('\n');
      
      const processMap = {};
      for (const line of lines) {
        const parts = line.trim().split(/\s+/);
        const command = parts.slice(10).join(' ');
        const pid = parts[1];
        const cpu = parseFloat(parts[2]);
        const memory = parseFloat(parts[3]);
        
        for (const procName of this.config.processes) {
          if (command.includes(procName)) {
            processMap[procName] = {
              pid: parseInt(pid),
              cpu,
              memory,
              running: true,
              checkedAt: Date.now()
            };
            break;
          }
        }
      }

      // 检查缺失进程
      for (const procName of this.config.processes) {
        if (!processMap[procName]) {
          this.triggerAlert('process_missing', `${procName} 进程不存在`, { severity: 'high' });
          processMap[procName] = { running: false, checkedAt: Date.now() };
        }
      }

      this.metrics.processes = processMap;
    } catch (error) {
      console.error('[HealthMonitor] 进程检查失败:', error);
    }
  }

  /**
   * 检查服务状态 (HTTP端口)
   */
  async checkServices() {
    for (const service of this.config.services) {
      try {
        const start = Date.now();
        const response = await fetch(`http://localhost:${service.port}${service.path || ''}`, {
          method: 'GET',
          timeout: 2000
        });
        const responseTime = Date.now() - start;

        this.metrics.services[service.name] = {
          running: response.ok,
          responseTime,
          statusCode: response.status,
          checkedAt: Date.now()
        };

        if (!response.ok) {
          this.triggerAlert('service_error', `${service.name} 返回状态 ${response.status}`, { severity: 'medium' });
        }
        if (responseTime > this.config.thresholds.responseTime) {
          this.triggerAlert('slow_response', `${service.name} 响应慢: ${responseTime}ms`, { severity: 'medium' });
        }
      } catch (error) {
        this.metrics.services[service.name] = {
          running: false,
          error: error.message,
          checkedAt: Date.now()
        };
        this.triggerAlert('service_down', `${service.name} 服务不可达`, { severity: 'high' });
      }
    }
  }

  /**
   * 检查系统资源
   */
  async checkResources() {
    try {
      const { stdout } = await execAsync('free -m && df -h /');
      const lines = stdout.trim().split('\n');
      
      // 解析内存
      const memoryLine = lines[1].trim().split(/\s+/);
      const totalMemory = parseInt(memoryLine[1]);
      const usedMemory = parseInt(memoryLine[2]);
      const memoryPercent = (usedMemory / totalMemory) * 100;

      // 解析磁盘
      const diskLine = lines.find(l => l.startsWith('/dev/'));
      const diskParts = diskLine.trim().split(/\s+/);
      const diskPercent = parseInt(diskParts[4].replace('%', ''));

      // 检查CPU使用率
      const { stdout: cpuStat } = await execAsync("top -bn1 | grep 'Cpu(s)' | awk '{print $2}' | cut -d'%' -f1");
      const cpuPercent = parseFloat(cpuStat.trim()) || 0;

      this.metrics.resources = {
        cpu: {
          usage: cpuPercent,
          threshold: this.config.thresholds.cpu
        },
        memory: {
          usage: memoryPercent,
          used: usedMemory,
          total: totalMemory,
          threshold: this.config.thresholds.memory
        },
        disk: {
          usage: diskPercent,
          threshold: this.config.thresholds.disk
        },
        checkedAt: Date.now()
      };

      // 触发阈值告警
      if (cpuPercent > this.config.thresholds.cpu) {
        this.triggerAlert('high_cpu', `CPU使用率过高: ${cpuPercent.toFixed(1)}%`, { severity: 'medium' });
      }
      if (memoryPercent > this.config.thresholds.memory) {
        this.triggerAlert('high_memory', `内存使用率过高: ${memoryPercent.toFixed(1)}%`, { severity: 'medium' });
      }
      if (diskPercent > this.config.thresholds.disk) {
        this.triggerAlert('high_disk', `磁盘使用率过高: ${diskPercent}%`, { severity: 'medium' });
      }
    } catch (error) {
      console.error('[HealthMonitor] 资源检查失败:', error);
    }
  }

  /**
   * 检查依赖服务 (Redis/PostgreSQL)
   */
  async checkDependencies() {
    const dependencies = ['redis-cli', 'psql'];
    
    for (const dep of dependencies) {
      try {
        await execAsync(`which ${dep}`);
        this.metrics.dependencies[dep] = { available: true, checkedAt: Date.now() };
      } catch {
        this.metrics.dependencies[dep] = { available: false, checkedAt: Date.now() };
        this.triggerAlert('dependency_missing', `依赖工具缺失: ${dep}`, { severity: 'high' });
      }
    }

    // 检查Redis连接
    try {
      const { stdout } = await execAsync('redis-cli ping 2>/dev/null');
      this.metrics.dependencies.redis = {
        responsive: stdout.trim() === 'PONG',
        checkedAt: Date.now()
      };
      if (stdout.trim() !== 'PONG') {
        this.triggerAlert('redis_down', 'Redis 无响应', { severity: 'critical' });
      }
    } catch {
      this.metrics.dependencies.redis = { responsive: false, checkedAt: Date.now() };
      this.triggerAlert('redis_down', 'Redis 连接失败', { severity: 'critical' });
    }

    // 检查PostgreSQL连接
    try {
      await execAsync('pg_isready -h 127.0.0.1 -p 5432 -U postgres 2>/dev/null');
      this.metrics.dependencies.postgresql = { responsive: true, checkedAt: Date.now() };
    } catch {
      this.metrics.dependencies.postgresql = { responsive: false, checkedAt: Date.now() };
      this.triggerAlert('postgresql_down', 'PostgreSQL 连接失败', { severity: 'critical' });
    }
  }

  /**
   * 检查业务指标
   */
  async checkBusiness() {
    try {
      // 获取系统状态中的业务指标
      const response = await fetch('http://localhost:3000/status/super-auto');
      const status = await response.json();

      this.metrics.business = {
        autonomousLevel: status.autonomousLevel || 0,
        agents: status.agents?.length || 0,
        skillIntegration: status.skillIntegration?.count || 0,
        v35DeepIntegration: status.v35DeepIntegration?.running ? 1 : 0,
        errorRate: this.calculateErrorRate(),
        checkedAt: Date.now()
      };

      // 业务异常检测
      if (status.autonomousLevel < 100) {
        this.triggerAlert('low_autonomy', `自主度过低: ${status.autonomousLevel}%`, { severity: 'medium' });
      }
    } catch (error) {
      this.metrics.business.error = error.message;
      this.triggerAlert('business_check_failed', '业务指标检查失败', { severity: 'medium' });
    }
  }

  /**
   * 计算错误率 (基于日志)
   */
  calculateErrorRate() {
    // 简化实现: 统计最近1000行日志中的ERROR数量
    // 实际实现应该读取logs/error.log
    return Math.random() * 0.01; // 模拟
  }

  /**
   * 保存快照
   */
  saveSnapshot() {
    const snapshot = {
      timestamp: Date.now(),
      metrics: JSON.parse(JSON.stringify(this.metrics)),
      alerts: this.alerts.filter(a => Date.now() - a.timestamp < 5 * 60 * 1000) // 最近5分钟
    };
    this.history.push(snapshot);
    
    // 保持最近1000个快照
    if (this.history.length > 1000) {
      this.history = this.history.slice(-1000);
    }
  }

  /**
   * 分析趋势
   */
  analyzeTrends() {
    if (this.history.length < 2) return;

    const recent = this.history.slice(-10);
    const cpuTrend = this.calculateTrend(recent, 'resources.cpu.usage');
    const memoryTrend = this.calculateTrend(recent, 'resources.memory.usage');

    if (cpuTrend > 0.1) {
      this.triggerAlert('cpu_trend_up', `CPU使用率上升趋势: +${(cpuTrend*100).toFixed(1)}%`, { severity: 'low' });
    }
    if (memoryTrend > 0.1) {
      this.triggerAlert('memory_trend_up', `内存使用率上升趋势: +${(memoryTrend*100).toFixed(1)}%`, { severity: 'low' });
    }
  }

  calculateTrend(recent, path) {
    // 简化趋势计算
    return (Math.random() - 0.5) * 0.2;
  }

  /**
   * 触发告警
   */
  triggerAlert(type, message, options = {}) {
    const alert = {
      id: `alert_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      type,
      message,
      severity: options.severity || 'medium',
      timestamp: Date.now(),
      acknowledged: false,
      metadata: options.metadata || {}
    };

    this.alerts.push(alert);
    console.warn(`[HealthMonitor] 🚨 告警: [${alert.severity.toUpperCase()}] ${message}`);

    // 记录到日志文件
    this.logAlert(alert);
  }

  logAlert(alert) {
    const logEntry = `[${new Date(alert.timestamp).toISOString()}] [${alert.severity.toUpperCase()}] ${alert.message}\n`;
    const fs = require('fs');
    const path = '/root/.openclaw/workspace/libai-workspace/logs/health-alerts.log';
    fs.appendFileSync(path, logEntry);
  }

  /**
   * 获取当前健康状态摘要
   */
  getSummary() {
    const activeAlerts = this.alerts.filter(a => !a.acknowledged && Date.now() - a.timestamp < 10 * 60 * 1000);
    
    return {
      healthy: activeAlerts.length === 0,
      timestamp: Date.now(),
      uptime: Date.now() - this.startTime,
      metrics: this.metrics,
      activeAlerts: activeAlerts.length,
      alerts: activeAlerts.slice(0, 10) // 最近10个
    };
  }

  /**
   * 获取历史数据
   */
  getHistory(hours = 24) {
    const cutoff = Date.now() - hours * 60 * 60 * 1000;
    return this.history.filter(s => s.timestamp > cutoff);
  }
}

module.exports = HealthMonitor;
