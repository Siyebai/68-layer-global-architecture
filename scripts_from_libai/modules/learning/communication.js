#!/usr/bin/env node
// 通信模块 (Communication) - 学习层模块
// 智能体间通信、事件总线、协作协议

const { SimpleLogger } = require('../../utils/logger');

class CommunicationModule {
  constructor(system) {
    this.system = system;
    this.logger = new SimpleLogger('info');
    this.initialized = false;
    this.running = false;
    this.metrics = {
      messagesSent: 0,
      messagesReceived: 0,
      activeChannels: 0,
      avgLatency: 0
    };
    this.channels = new Map();
    this.subscribers = new Map();
  }

  async initialize() {
    this.logger.info('[Communication] 初始化通信模块...');
    
    // 预定义频道
    this.createChannel('system_events');
    this.createChannel('agent_status');
    this.createChannel('knowledge_sharing');
    this.createChannel('alerts');
    
    this.initialized = true;
    this.logger.info('[Communication] 初始化完成，4个频道已创建');
  }

  start() {
    if (!this.initialized) {
      this.logger.warn('[Communication] 未初始化，跳过启动');
      return;
    }
    
    this.running = true;
    this.logger.info('[Communication] 启动通信网络...');
    
    // 启动心跳广播
    this.startHeartbeat();
    
    // 启动消息路由
    this.startMessageRouter();
    
    this.logger.info('[Communication] ✅ 通信模块已启动');
  }

  // ========== 频道管理 ==========

  createChannel(name) {
    if (this.channels.has(name)) return this.channels.get(name);
    
    const channel = {
      name,
      messages: [],
      subscribers: new Set(),
      createdAt: Date.now()
    };
    
    this.channels.set(name, channel);
    this.metrics.activeChannels++;
    this.logger.debug(`[频道] 创建: ${name}`);
    
    return channel;
  }

  subscribe(channelName, callback) {
    const channel = this.channels.get(channelName);
    if (!channel) {
      throw new Error(`频道不存在: ${channelName}`);
    }
    
    channel.subscribers.add(callback);
    this.subscribers.set(callback, channelName);
    
    this.logger.debug(`[订阅] 回调订阅到频道: ${channelName}`);
  }

  unsubscribe(callback) {
    const channelName = this.subscribers.get(callback);
    if (channelName) {
      const channel = this.channels.get(channelName);
      if (channel) {
        channel.subscribers.delete(callback);
      }
      this.subscribers.delete(callback);
    }
  }

  // ========== 消息发布 ==========

  async publish(channelName, message) {
    const channel = this.channels.get(channelName);
    if (!channel) {
      throw new Error(`频道不存在: ${channelName}`);
    }
    
    const envelope = {
      id: this.generateMessageId(),
      channel: channelName,
      timestamp: Date.now(),
      data: message,
      sender: 'system'
    };
    
    // 存储消息
    channel.messages.push(envelope);
    if (channel.messages.length > 1000) {
      channel.messages = channel.messages.slice(-500);
    }
    
    // 广播给订阅者
    for (const subscriber of channel.subscribers) {
      try {
        await subscriber(envelope);
        this.metrics.messagesSent++;
      } catch (err) {
        this.logger.error('[发布] 回调错误:', err.message);
      }
    }
    
    return envelope.id;
  }

  // ========== 心跳与发现 ==========

  startHeartbeat() {
    setInterval(() => {
      this.broadcastHeartbeat();
    }, 30 * 1000); // 30秒心跳
  }

  async broadcastHeartbeat() {
    const agents = this.getActiveAgents();
    await this.publish('system_events', {
      type: 'heartbeat',
      agents,
      timestamp: Date.now()
    });
  }

  getActiveAgents() {
    if (!this.system || !this.system.agents) return [];
    return this.system.agents.map(agent => ({
      id: agent.id,
      type: agent.type,
      state: agent.state || 'unknown'
    }));
  }

  // ========== 消息路由 ==========

  startMessageRouter() {
    // 消息路由逻辑 (简化)
    this.logger.debug('[路由] 消息路由器启动');
  }

  async routeMessage(envelope) {
    // 根据消息类型路由到不同处理逻辑
    switch (envelope.data.type) {
      case 'knowledge_share':
        await this.handleKnowledgeShare(envelope);
        break;
      case 'alert':
        await this.handleAlert(envelope);
        break;
      case 'request':
        await this.handleRequest(envelope);
        break;
      default:
        this.logger.debug(`[路由] 未知消息类型: ${envelope.data.type}`);
    }
  }

  async handleKnowledgeShare(envelope) {
    // 知识共享消息
    if (this.system && this.system.knowledgeSystem) {
      try {
        await this.system.knowledgeSystem.shareLearning(
          envelope.data.knowledge,
          envelope.data.from
        );
        this.logger.info(`[知识共享] 来自 ${envelope.data.from}: ${envelope.data.knowledge.length} 条知识`);
      } catch (err) {
        this.logger.error('[知识共享] 失败:', err.message);
      }
    }
  }

  async handleAlert(envelope) {
    // 告警消息
    this.logger.warn(`[告警] ${envelope.data.message} (级别: ${envelope.data.level})`);
    
    // 立即广播给告警频道
    await this.publish('alerts', envelope.data);
  }

  async handleRequest(envelope) {
    // 请求响应消息
    const { requestId, action, params } = envelope.data;
    
    try {
      let result;
      switch (action) {
        case 'get_status':
          result = await this.system.getStatus();
          break;
        case 'get_metrics':
          result = await this.system.getMetrics();
          break;
        default:
          result = { error: '未知操作' };
      }
      
      // 回复
      await this.publish('system_events', {
        type: 'response',
        requestId,
        result
      });
      
    } catch (err) {
      this.logger.error('[请求] 处理失败:', err.message);
    }
  }

  // ========== 协作学习 ==========

  async shareKnowledge(knowledge, fromAgent = 'local') {
    await this.publish('knowledge_sharing', {
      type: 'knowledge_share',
      from: fromAgent,
      knowledge,
      timestamp: Date.now()
    });
  }

  async broadcastAlert(message, level = 'info') {
    await this.publish('alerts', {
      type: 'alert',
      message,
      level,
      timestamp: Date.now()
    });
  }

  // ========== 统计与监控 ==========

  generateMessageId() {
    return `msg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  getChannelStats() {
    const stats = {};
    for (const [name, channel] of this.channels) {
      stats[name] = {
        subscribers: channel.subscribers.size,
        messages: channel.messages.length,
        createdAt: channel.createdAt
      };
    }
    return stats;
  }

  // ========== 公共接口 ==========

  async getMetrics() {
    return {
      ...this.metrics,
      channelStats: this.getChannelStats(),
      uptime: Date.now() - (this.startTime || Date.now())
    };
  }

  async getStatus() {
    return {
      initialized: this.initialized,
      running: this.running,
      metrics: this.metrics,
      channels: Array.from(this.channels.keys()),
      subscribersCount: this.subscribers.size
    };
  }

  async getRecentMessages(channelName, limit = 50) {
    const channel = this.channels.get(channelName);
    if (!channel) return [];
    return channel.messages.slice(-limit);
  }
}

module.exports = { CommunicationModule };
