/**
 * Agent注册中心 — 统一管理所有智能体生命周期
 * 功能：注册/注销/发现/健康检查/负载均衡/自动扩缩容
 * 作者：Q李白 | 2026-03-27
 */

const { eventBus } = require('./event-bus');

/**
 * 智能体元数据
 */
class AgentMeta {
  constructor(config) {
    this.id = config.id;
    this.name = config.name;
    this.group = config.group;          // 所属小组
    this.role = config.role;            // 角色
    this.version = config.version || '1.0.0';
    this.capabilities = config.capabilities || [];
    this.priority = config.priority || 5;  // 优先级1-10
    
    // 运行时状态
    this.status = 'registered';       // registered/ready/busy/offline/failed
    this.pid = null;                  // 进程ID
    this.startTime = null;            // 启动时间
    this.lastHeartbeat = Date.now();
    this.heartbeatInterval = config.heartbeatInterval || 30000;
    
    // 负载指标
    this.load = {
      cpu: 0,
      memory: 0,
      activeTasks: 0,
      completedTasks: 0,
      failedTasks: 0,
      avgResponseTime: 0
    };
    
    // 资源声明
    this.resources = {
      writes: config.writes || [],      // 声明可写文件（防冲突）
      reads: config.reads || [],        // 声明可读文件
      apis: config.apis || []           // 声明可用API
    };
    
    // 依赖
    this.dependencies = config.dependencies || [];   // 前置Agent
    this.dependents = [];                               // 被依赖的Agent
  }
}

/**
 * 注册中心
 */
class AgentRegistry {
  constructor() {
    this.agents = new Map();       // agentId -> AgentMeta
    this.groups = new Map();       // groupName -> Set<agentId>
    this.capabilityIndex = new Map(); // capability -> Set<agentId>
    this.history = [];              // 状态变更历史
    this.maxAgents = 50;           // 最大Agent数
  }

  /**
   * 注册Agent
   */
  register(config) {
    if (this.agents.size >= this.maxAgents) {
      throw new Error(`Max agents reached: ${this.maxAgents}`);
    }
    
    if (this.agents.has(config.id)) {
      throw new Error(`Agent ${config.id} already registered`);
    }
    
    const agent = new AgentMeta(config);
    agent.startTime = Date.now();
    
    this.agents.set(config.id, agent);
    
    // 组管理
    if (!this.groups.has(config.group)) {
      this.groups.set(config.group, new Set());
    }
    this.groups.get(config.group).add(config.id);
    
    // 能力索引
    config.capabilities?.forEach(cap => {
      if (!this.capabilityIndex.has(cap)) {
        this.capabilityIndex.set(cap, new Set());
      }
      this.capabilityIndex.get(cap).add(config.id);
    });
    
    // 依赖关系
    config.dependencies?.forEach(depId => {
      const dep = this.agents.get(depId);
      if (dep) dep.dependents.push(config.id);
    });
    
    // 事件通知
    eventBus.publish('registry:agent:registered', 
      { agentId: config.id, group: config.group, role: config.role },
      'registry', { priority: 3 }
    );
    
    this.logStateChange(config.id, 'registered', null);
    
    return agent;
  }

  /**
   * 注销Agent
   */
  unregister(agentId) {
    const agent = this.agents.get(agentId);
    if (!agent) return;
    
    // 清理组
    this.groups.get(agent.group)?.delete(agentId);
    
    // 清理能力索引
    agent.capabilities.forEach(cap => {
      this.capabilityIndex.get(cap)?.delete(agentId);
    });
    
    // 清理依赖
    agent.dependents.forEach(depId => {
      const dep = this.agents.get(depId);
      if (dep) {
        dep.dependencies = dep.dependencies.filter(d => d !== agentId);
      }
    });
    
    this.agents.delete(agentId);
    
    eventBus.publish('registry:agent:unregistered',
      { agentId },
      'registry', { priority: 3 }
    );
    
    this.logStateChange(agentId, 'unregistered', agent.status);
  }

  /**
   * 按能力查找Agent
   */
  findByCapability(capability) {
    const ids = this.capabilityIndex.get(capability);
    if (!ids) return [];
    
    return Array.from(ids)
      .map(id => this.agents.get(id))
      .filter(a => a && (a.status === 'ready' || a.status === 'busy'))
      .sort((a, b) => a.load.activeTasks - b.load.activeTasks); // 最低负载优先
  }

  /**
   * 按组查找Agent
   */
  findByGroup(group) {
    const ids = this.groups.get(group);
    if (!ids) return [];
    return Array.from(ids).map(id => this.agents.get(id)).filter(Boolean);
  }

  /**
   * 获取组Leader
   */
  getGroupLeader(group) {
    const agents = this.findByGroup(group);
    return agents.find(a => a.role.includes('组长') || a.role.includes('Leader'));
  }

  /**
   * 负载均衡选择
   */
  selectAgent(capability, strategy = 'least-load') {
    const candidates = this.findByCapability(capability);
    
    if (candidates.length === 0) return null;
    
    switch (strategy) {
      case 'least-load':
        return candidates[0]; // 已按负载排序
      case 'round-robin':
        return candidates[Math.floor(Date.now() / 60000) % candidates.length];
      case 'random':
        return candidates[Math.floor(Math.random() * candidates.length)];
      case 'priority':
        return candidates.sort((a, b) => b.priority - a.priority)[0];
      default:
        return candidates[0];
    }
  }

  /**
   * 健康检查
   */
  heartbeat(agentId) {
    const agent = this.agents.get(agentId);
    if (!agent) return false;
    
    const prevStatus = agent.status;
    agent.lastHeartbeat = Date.now();
    
    if (prevStatus === 'offline') {
      agent.status = 'ready';
      this.logStateChange(agentId, 'ready', 'offline');
      eventBus.publish('registry:agent:recovered', { agentId }, 'registry');
    }
    
    return true;
  }

  /**
   * 检查所有Agent健康
   */
  healthCheck(timeoutMs = 60000) {
    const now = Date.now();
    const unhealthy = [];
    
    this.agents.forEach((agent, id) => {
      const elapsed = now - agent.lastHeartbeat;
      
      if (elapsed > timeoutMs && agent.status !== 'failed') {
        const prev = agent.status;
        agent.status = 'offline';
        unhealthy.push(id);
        
        this.logStateChange(id, 'offline', prev);
        eventBus.publish('registry:agent:unhealthy', 
          { agentId: id, elapsed, lastStatus: prev }, 'registry', { priority: 2 }
        );
      }
    });
    
    return unhealthy;
  }

  /**
   * 更新Agent负载
   */
  updateLoad(agentId, metrics) {
    const agent = this.agents.get(agentId);
    if (!agent) return;
    
    Object.assign(agent.load, metrics);
    
    // 状态自动切换
    if (metrics.activeTasks > 0 && agent.status === 'ready') {
      agent.status = 'busy';
    } else if (metrics.activeTasks === 0 && agent.status === 'busy') {
      agent.status = 'ready';
    }
  }

  /**
   * 获取系统全景
   */
  getSystemOverview() {
    const agents = Array.from(this.agents.values());
    
    return {
      totalAgents: agents.length,
      byStatus: {
        ready: agents.filter(a => a.status === 'ready').length,
        busy: agents.filter(a => a.status === 'busy').length,
        offline: agents.filter(a => a.status === 'offline').length,
        failed: agents.filter(a => a.status === 'failed').length
      },
      byGroup: Array.from(this.groups.entries()).reduce((acc, [name, ids]) => {
        acc[name] = ids.size;
        return acc;
      }, {}),
      totalLoad: {
        activeTasks: agents.reduce((s, a) => s + a.load.activeTasks, 0),
        completedTasks: agents.reduce((s, a) => s + a.load.completedTasks, 0),
        avgResponseTime: agents.length > 0
          ? (agents.reduce((s, a) => s + a.load.avgResponseTime, 0) / agents.length).toFixed(2)
          : 0
      },
      conflicts: eventBus.conflicts.filter(c => !c.resolvedAt).length,
      uptime: agents.length > 0
        ? ((Date.now() - Math.min(...agents.map(a => a.startTime))) / 3600000).toFixed(2) + 'h'
        : 'N/A'
    };
  }

  /**
   * 依赖图检查
   * 确保新Agent加入时依赖链完整
   */
  validateDependencies(agentId) {
    const agent = this.agents.get(agentId);
    if (!agent) return { valid: false, missing: [] };
    
    const missing = agent.dependencies.filter(depId => !this.agents.has(depId));
    
    return {
      valid: missing.length === 0,
      missing,
      dependents: agent.dependents,
      circular: this.detectCircular(agentId, new Set())
    };
  }

  /**
   * 环形依赖检测
   */
  detectCircular(agentId, visited) {
    if (visited.has(agentId)) return true;
    visited.add(agentId);
    
    const agent = this.agents.get(agentId);
    if (!agent) return false;
    
    return agent.dependencies.some(depId => this.detectCircular(depId, visited));
  }

  /**
   * 资源冲突检查
   * 同一文件只能一个Agent写入
   */
  validateResources(agentId) {
    const agent = this.agents.get(agentId);
    if (!agent) return { conflicts: [] };
    
    const conflicts = [];
    
    agent.resources.writes.forEach(file => {
      this.agents.forEach((other, otherId) => {
        if (otherId !== agentId && other.resources.writes.includes(file)) {
          conflicts.push({ file, agents: [agentId, otherId] });
        }
      });
    });
    
    return { conflicts };
  }

  logStateChange(agentId, newStatus, oldStatus) {
    this.history.push({
      agentId, newStatus, oldStatus,
      timestamp: Date.now()
    });
    if (this.history.length > 5000) this.history = this.history.slice(-2000);
  }
}

module.exports = { AgentRegistry, AgentMeta };
