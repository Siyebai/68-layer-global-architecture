#!/usr/bin/env node
// 超级自主系统矩阵管理器 - V26深度整合版
// 统一管理多个自主系统版本，实现跨系统协作

class AutonomousMatrix {
  constructor() {
    this.systems = new Map();
    this.matrixStats = {
      totalAutonomyLevel: 0,
      activeSystems: 0,
      crossSystemMessages: 0,
      sharedKnowledgeSize: 0
    };
  }

  async registerSystem(name, system, port, autonomyLevel) {
    this.systems.set(name, {
      system,
      port,
      autonomyLevel,
      status: 'running',
      lastHeartbeat: Date.now(),
      capabilities: this.enumerateCapabilities(system)
    });
    
    this.matrixStats.activeSystems++;
    this.updateMatrixStats();
    
    console.log(`✅ [矩阵] 系统已注册: ${name} (端口:${port}, 自主度:${autonomyLevel}%)`);
    
    // 启动系统间通信桥接
    this.startCrossSystemBridge(name);
  }

  enumerateCapabilities(system) {
    const caps = [];
    
    if (system.layers) {
      for (const [layer, modules] of Object.entries(system.layers)) {
        if (modules.running > 0) {
          caps.push(`${layer}(${modules.running}/${Object.keys(modules).length})`);
        }
      }
    }
    
    if (system.getStatus) {
      const status = system.getStatus();
      if (status.stats) {
        const { cycles, perceptions, cognitions, actions, learnings, evolutions } = status.stats;
        if (cycles > 0) caps.push(`cycles:${cycles}`);
        if (perceptions > 0) caps.push(`perceptions:${perceptions}`);
        if (actions > 0) caps.push(`actions:${actions}`);
      }
    }
    
    return caps;
  }

  startCrossSystemBridge(systemName) {
    // 系统间知识共享与协调
    setInterval(() => {
      this.shareKnowledge(systemName);
      this.syncPerformanceMetrics(systemName);
    }, 60 * 1000); // 每分钟同步一次
  }

  async shareKnowledge(sourceSystem) {
    try {
      const source = this.systems.get(sourceSystem);
      if (!source || !source.system.learningEngine) return;
      
      const kb = source.system.learningEngine.knowledgeBase;
      if (!kb || kb.size === 0) return;
      
      // 提取关键知识条目
      const knowledge = [];
      for (const [key, entries] of kb.entries()) {
        if (entries.length > 0) {
          knowledge.push({
            key,
            pattern: entries[entries.length - 1].conditions,
            performance: entries.slice(-10).reduce((sum, e) => sum + e.profit, 0) / Math.min(entries.length, 10)
          });
        }
      }
      
      // 广播给其他系统
      for (const [targetName, target] of this.systems.entries()) {
        if (targetName !== sourceSystem && target.system.learningEngine) {
          this.transferKnowledge(target.system, knowledge);
        }
      }
      
      this.matrixStats.crossSystemMessages += knowledge.length;
    } catch (err) {
      console.error(`[矩阵] 知识共享失败 (${sourceSystem}):`, err.message);
    }
  }

  async transferKnowledge(targetSystem, knowledge) {
    if (!targetSystem.learningEngine) return;
    
    for (const item of knowledge) {
      if (!targetSystem.learningEngine.knowledgeBase.has(item.key)) {
        targetSystem.learningEngine.knowledgeBase.set(item.key, []);
      }
      targetSystem.learningEngine.knowledgeBase.get(item.key).push({
        profit: item.performance,
        conditions: item.pattern,
        timestamp: Date.now(),
        source: 'matrix-transfer'
      });
    }
    
    this.matrixStats.sharedKnowledgeSize += knowledge.length;
  }

  async syncPerformanceMetrics(systemName) {
    try {
      const system = this.systems.get(systemName);
      if (!system) return;
      
      let metrics = {};
      if (system.system.state && system.system.state.metrics) {
        metrics = system.system.state.metrics;
      } else if (system.system.getStatus) {
        const status = system.system.getStatus();
        metrics = status.metrics || {};
      }
      
      // 发布到系统矩阵统计
      console.log(`[矩阵] ${systemName} 性能:`, {
        trades: metrics.tradesExecuted || 0,
        profit: metrics.profit || 0,
        learningCycles: metrics.learningCycles || 0,
        knowledgeSize: metrics.knowledgeBaseSize || 0,
        uptime: Date.now() - (system.system.startTime || Date.now())
      });
    } catch (err) {
      console.error(`[矩阵] 指标同步失败 (${systemName}):`, err.message);
    }
  }

  updateMatrixStats() {
    let totalLevel = 0;
    for (const [, sys] of this.systems) {
      totalLevel += sys.autonomyLevel;
    }
    this.matrixStats.totalAutonomyLevel = Math.round(totalLevel / this.systems.size);
  }

  getMatrixStatus() {
    const systemsStatus = {};
    for (const [name, info] of this.systems) {
      systemsStatus[name] = {
        status: info.status,
        autonomyLevel: info.autonomyLevel,
        port: info.port,
        capabilities: info.capabilities,
        uptime: Date.now() - info.lastHeartbeat
      };
    }
    
    return {
      matrixName: 'SuperAutonomousMatrix V1.0',
      timestamp: Date.now(),
      stats: this.matrixStats,
      systems: systemsStatus,
      matrixAutonomyLevel: this.matrixStats.totalAutonomyLevel
    };
  }

  // 健康检查所有系统
  async healthCheck() {
    const results = [];
    for (const [name, info] of this.systems) {
      try {
        const response = await fetch(`http://localhost:${info.port}/health`, { 
          method: 'GET', 
          timeout: 5000 
        });
        const data = await response.json();
        results.push({ name, healthy: true, data });
      } catch (err) {
        results.push({ name, healthy: false, error: err.message });
      }
    }
    return results;
  }
}

module.exports = { AutonomousMatrix };
