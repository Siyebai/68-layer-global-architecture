/**
 * 智能体基类 - 多智能体协作基础
 * 功能：智能体基础能力、通信、状态管理
 * 作者：Q李白
 * 日期：2026-03-27
 */

const EventEmitter = require('events');

/**
 * 智能体基类
 */
class BaseAgent extends EventEmitter {
  constructor(config) {
    super();
    
    this.id = config.id;
    this.name = config.name;
    this.role = config.role;
    this.capabilities = config.capabilities || [];
    
    // 状态
    this.status = 'idle';
    this.currentTask = null;
    this.memory = new Map();
    
    // 性能指标
    this.metrics = {
      tasksCompleted: 0,
      tasksFailed: 0,
      totalProcessingTime: 0,
      averageResponseTime: 0
    };
    
    // 配置
    this.config = {
      maxMemory: config.maxMemory || 1000,
      heartbeatInterval: config.heartbeatInterval || 30000,
      ...config
    };
    
    // 心跳定时器
    this.heartbeatTimer = null;
  }
  
  /**
   * 启动智能体
   */
  async start(scheduler) {
    this.scheduler = scheduler;
    
    // 注册到调度器
    this.scheduler.registerAgent({
      id: this.id,
      name: this.name,
      capabilities: this.capabilities
    });
    
    // 启动心跳
    this.startHeartbeat();
    
    this.status = 'ready';
    this.emit('agent:started', { id: this.id });
    
    console.log(`[${this.name}] 智能体已启动`);
  }
  
  /**
   * 停止智能体
   */
  async stop() {
    // 停止心跳
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
    }
    
    // 完成当前任务
    if (this.currentTask) {
      await this.abortTask(this.currentTask);
    }
    
    // 从调度器注销
    if (this.scheduler) {
      this.scheduler.unregisterAgent(this.id);
    }
    
    this.status = 'stopped';
    this.emit('agent:stopped', { id: this.id });
    
    console.log(`[${this.name}] 智能体已停止`);
  }
  
  /**
   * 启动心跳
   */
  startHeartbeat() {
    this.heartbeatTimer = setInterval(() => {
      if (this.scheduler) {
        this.scheduler.heartbeat(this.id);
      }
    }, this.config.heartbeatInterval);
  }
  
  /**
   * 执行任务
   */
  async execute(task) {
    if (this.status !== 'ready') {
      throw new Error(`Agent ${this.name} is not ready`);
    }
    
    const startTime = Date.now();
    
    try {
      this.status = 'busy';
      this.currentTask = task;
      
      this.emit('task:start', { agent: this.id, task: task.id });
      
      // 执行任务（子类实现）
      const result = await this.perform(task);
      
      // 更新指标
      const processingTime = Date.now() - startTime;
      this.updateMetrics(true, processingTime);
      
      // 标记完成
      this.status = 'ready';
      this.currentTask = null;
      
      this.emit('task:complete', { 
        agent: this.id, 
        task: task.id, 
        result,
        processingTime
      });
      
      return result;
      
    } catch (error) {
      // 更新指标
      const processingTime = Date.now() - startTime;
      this.updateMetrics(false, processingTime);
      
      // 标记失败
      this.status = 'error';
      this.currentTask = null;
      
      this.emit('task:error', { 
        agent: this.id, 
        task: task.id, 
        error: error.message 
      });
      
      throw error;
    }
  }
  
  /**
   * 执行任务（子类实现）
   */
  async perform(task) {
    throw new Error('Subclass must implement perform()');
  }
  
  /**
   * 中止任务
   */
  async abortTask(task) {
    this.emit('task:abort', { agent: this.id, task: task.id });
    this.status = 'ready';
    this.currentTask = null;
  }
  
  /**
   * 更新指标
   */
  updateMetrics(success, processingTime) {
    if (success) {
      this.metrics.tasksCompleted++;
    } else {
      this.metrics.tasksFailed++;
    }
    
    this.metrics.totalProcessingTime += processingTime;
    this.metrics.averageResponseTime = 
      this.metrics.totalProcessingTime / 
      (this.metrics.tasksCompleted + this.metrics.tasksFailed);
  }
  
  /**
   * 内存管理
   */
  remember(key, value) {
    if (this.memory.size >= this.config.maxMemory) {
      // LRU淘汰
      const firstKey = this.memory.keys().next().value;
      this.memory.delete(firstKey);
    }
    
    this.memory.set(key, {
      value,
      timestamp: Date.now()
    });
  }
  
  recall(key) {
    const item = this.memory.get(key);
    if (item) {
      return item.value;
    }
    return null;
  }
  
  forget(key) {
    this.memory.delete(key);
  }
  
  /**
   * 与其他智能体通信
   */
  async sendMessage(targetAgentId, message) {
    this.emit('message:send', {
      from: this.id,
      to: targetAgentId,
      message,
      timestamp: Date.now()
    });
    
    // 实际通信由调度器处理
    if (this.scheduler) {
      return this.scheduler.sendMessage(this.id, targetAgentId, message);
    }
  }
  
  /**
   * 广播消息
   */
  async broadcast(message) {
    this.emit('message:broadcast', {
      from: this.id,
      message,
      timestamp: Date.now()
    });
    
    if (this.scheduler) {
      return this.scheduler.broadcast(this.id, message);
    }
  }
  
  /**
   * 获取状态
   */
  getStatus() {
    return {
      id: this.id,
      name: this.name,
      role: this.role,
      status: this.status,
      capabilities: this.capabilities,
      currentTask: this.currentTask?.id || null,
      metrics: this.metrics,
      memorySize: this.memory.size
    };
  }
}

/**
 * 三李白智能体实现
 */
class LibaiAgent extends BaseAgent {
  constructor(config) {
    super(config);
    
    this.type = config.type; // 'local' | 'cloud' | 'q'
    this.specialties = config.specialties || [];
  }
  
  async perform(task) {
    switch (task.type) {
      case 'learn':
        return await this.learn(task.payload);
      case 'trade':
        return await this.trade(task.payload);
      case 'analyze':
        return await this.analyze(task.payload);
      case 'monitor':
        return await this.monitor(task.payload);
      case 'report':
        return await this.report(task.payload);
      default:
        throw new Error(`Unknown task type: ${task.type}`);
    }
  }
  
  async learn(data) {
    // 学习任务
    console.log(`[${this.name}] 执行学习任务:`, data.topic);
    
    // 模拟学习过程
    await new Promise(resolve => setTimeout(resolve, 500));
    
    return {
      learned: true,
      topic: data.topic,
      insights: ['洞察1', '洞察2', '洞察3']
    };
  }
  
  async trade(data) {
    // 交易任务
    console.log(`[${this.name}] 执行交易任务:`, data.action);
    
    await new Promise(resolve => setTimeout(resolve, 300));
    
    return {
      executed: true,
      action: data.action,
      result: 'success'
    };
  }
  
  async analyze(data) {
    // 分析任务
    console.log(`[${this.name}] 执行分析任务:`, data.target);
    
    await new Promise(resolve => setTimeout(resolve, 400));
    
    return {
      analyzed: true,
      target: data.target,
      findings: ['发现1', '发现2']
    };
  }
  
  async monitor(data) {
    // 监控任务
    console.log(`[${this.name}] 执行监控任务:`, data.scope);
    
    await new Promise(resolve => setTimeout(resolve, 200));
    
    return {
      monitored: true,
      scope: data.scope,
      status: 'healthy'
    };
  }
  
  async report(data) {
    // 汇报任务
    console.log(`[${this.name}] 执行汇报任务:`, data.type);
    
    await new Promise(resolve => setTimeout(resolve, 100));
    
    return {
      reported: true,
      type: data.type,
      content: '汇报内容...'
    };
  }
}

/**
 * 智能体工厂
 */
class AgentFactory {
  static createLocalLibai() {
    return new LibaiAgent({
      id: 'libai-local',
      name: '本地李白',
      role: 'learning',
      type: 'local',
      capabilities: ['learn', 'analyze', 'research', 'optimize'],
      specialties: ['理论学习', '算法研究', '系统优化']
    });
  }
  
  static createCloudLibai() {
    return new LibaiAgent({
      id: 'libai-cloud',
      name: '云端李白',
      role: 'trading',
      type: 'cloud',
      capabilities: ['trade', 'monitor', 'execute', 'risk-control'],
      specialties: ['交易执行', '风险控制', '实时监控']
    });
  }
  
  static createQLibai() {
    return new LibaiAgent({
      id: 'libai-q',
      name: 'Q李白',
      role: 'coordination',
      type: 'q',
      capabilities: ['learn', 'analyze', 'optimize', 'report', 'coordinate'],
      specialties: ['知识整理', '系统优化', '协作协调']
    });
  }
}

module.exports = {
  BaseAgent,
  LibaiAgent,
  AgentFactory
};
