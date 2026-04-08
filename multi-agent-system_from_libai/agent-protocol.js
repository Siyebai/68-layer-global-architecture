/**
 * 智能体通信协议 — 无缝衔接标准
 * 作者：Q李白 | 2026-03-27
 * 
 * 核心设计：
 * - 文件锁：同一文件只允许一个Agent写入
 * - 序列号：所有事件全局有序
 * - 消息确认：关键消息必须ACK
 * - 断线重连：自动恢复通信
 */

const { eventBus } = require('./event-bus');
const fs = require('fs');
const path = require('path');

// ========== 全局序列号 ==========
class SequenceGenerator {
  constructor() {
    this.seq = 0;
  }
  next() {
    return ++this.seq;
  }
  current() {
    return this.seq;
  }
}
const globalSeq = new SequenceGenerator();

// ========== 分布式文件锁 ==========
class FileLockManager {
  constructor() {
    this.locks = new Map();       // filePath -> { agentId, seq, expiresAt }
    this.waitQueue = new Map();   // filePath -> [{ agentId, resolve, timer }]
  }

  /**
   * 获取文件写锁
   * @returns {Promise<boolean>} 是否成功获取锁
   */
  async acquireLock(agentId, filePath, timeout = 5000) {
    // 如果已被锁
    if (this.locks.has(filePath)) {
      const lock = this.locks.get(filePath);
      
      // 锁已过期，强制释放
      if (lock.expiresAt < Date.now()) {
        this.releaseLock(filePath);
      } else if (lock.agentId === agentId) {
        // 同一Agent重入
        return true;
      } else {
        // 等待锁释放
        return new Promise((resolve) => {
          if (!this.waitQueue.has(filePath)) {
            this.waitQueue.set(filePath, []);
          }
          
          const timer = setTimeout(() => {
            this.waitQueue.get(filePath) = this.waitQueue.get(filePath)
              .filter(w => w.agentId !== agentId);
            resolve(false);
          }, timeout);
          
          this.waitQueue.get(filePath).push({ agentId, resolve, timer });
        });
      }
    }
    
    // 获取锁成功
    this.locks.set(filePath, {
      agentId,
      seq: globalSeq.next(),
      acquiredAt: Date.now(),
      expiresAt: Date.now() + 30000  // 30秒自动过期
    });
    
    eventBus.publish('lock:acquired', 
      { agentId, filePath, seq: this.locks.get(filePath).seq },
      'file-lock-manager', { priority: 2 }
    );
    
    return true;
  }

  /**
   * 释放文件锁
   */
  releaseLock(filePath) {
    const lock = this.locks.get(filePath);
    if (!lock) return;
    
    this.locks.delete(filePath);
    
    eventBus.publish('lock:released',
      { agentId: lock.agentId, filePath, seq: lock.seq },
      'file-lock-manager', { priority: 2 }
    );
    
    // 通知等待队列
    const waiting = this.waitQueue.get(filePath) || [];
    if (waiting.length > 0) {
      const next = waiting.shift();
      clearTimeout(next.timer);
      next.resolve(true);
    }
  }

  /**
   * 检查文件锁状态
   */
  isLocked(filePath) {
    return this.locks.has(filePath);
  }

  getLockInfo(filePath) {
    return this.locks.get(filePath) || null;
  }
}
const fileLocks = new FileLockManager();

// ========== 消息确认机制 ==========
class AckTracker {
  constructor() {
    this.pending = new Map();   // eventId -> { source, target, payload, timer, retries }
    this.maxRetries = 3;
    this.ackTimeout = 10000;    // 10秒超时
  }

  /**
   * 发送需要确认的消息
   */
  sendWithAck(event, payload, source, targetAgents, callback) {
    const eventId = `ack-${Date.now()}-${Math.random().toString(36).substr(2, 6)}`;
    
    this.pending.set(eventId, {
      source,
      targetAgents: [...targetAgents],
      confirmedBy: new Set(),
      payload,
      callback: callback || (() => {}),
      retries: 0,
      sentAt: Date.now()
    });
    
    // 发送消息
    eventBus.publish(event, { ...payload, __ackId: eventId, __source: source }, source, {
      targetAgents,
      requiresAck: true
    });
    
    // 设置超时
    const timer = setTimeout(() => {
      this.checkAck(eventId);
    }, this.ackTimeout);
    
    this.pending.get(eventId).timer = timer;
    
    return eventId;
  }

  /**
   * 确认收到消息
   */
  confirm(eventId, agentId) {
    const pending = this.pending.get(eventId);
    if (!pending) return;
    
    pending.confirmedBy.add(agentId);
    
    // 所有目标都确认了
    if (pending.confirmedBy.size >= pending.targetAgents.length) {
      this.resolve(eventId, true);
    }
  }

  /**
   * 检查确认状态
   */
  checkAck(eventId) {
    const pending = this.pending.get(eventId);
    if (!pending) return;
    
    const unconfirmed = pending.targetAgents.filter(
      a => !pending.confirmedBy.has(a)
    );
    
    if (unconfirmed.length === 0) {
      this.resolve(eventId, true);
    } else if (pending.retries < this.maxRetries) {
      // 重试
      pending.retries++;
      
      eventBus.publish(
        `retry:${pending.event.split(':')[0]}`,
        { ...pending.payload, __ackId: eventId, __retry: pending.retries },
        pending.source,
        { targetAgents: unconfirmed }
      );
      
      pending.timer = setTimeout(() => this.checkAck(eventId), this.ackTimeout);
    } else {
      // 超过重试次数
      this.resolve(eventId, false, unconfirmed);
    }
  }

  /**
   * 解决ACK
   */
  resolve(eventId, success, failedAgents = []) {
    const pending = this.pending.get(eventId);
    if (!pending) return;
    
    clearTimeout(pending.timer);
    pending.callback({
      success,
      confirmedBy: Array.from(pending.confirmedBy),
      failedAgents,
      retries: pending.retries,
      duration: Date.now() - pending.sentAt
    });
    
    this.pending.delete(eventId);
  }

  getPendingCount() {
    return this.pending.size;
  }
}
const ackTracker = new AckTracker();

// ========== 智能体消息协议 ==========
class AgentProtocol {
  constructor(agentId) {
    this.agentId = agentId;
    this.inbox = [];
    this.processedSeq = 0;
  }

  /**
   * 发送消息给指定Agent
   */
  sendTo(targetAgentId, type, data, options = {}) {
    return eventBus.publish(
      `agent:${targetAgentId}:${type}`,
      {
        ...data,
        __from: this.agentId,
        __seq: globalSeq.next(),
        __type: type
      },
      this.agentId,
      {
        priority: options.priority || 5,
        requiresAck: options.requiresAck || false,
        targetAgents: [targetAgentId]
      }
    );
  }

  /**
   * 广播给全组
   */
  broadcastToGroup(group, type, data, options = {}) {
    return eventBus.publish(
      `group:${group}:${type}`,
      {
        ...data,
        __from: this.agentId,
        __seq: globalSeq.next(),
        __type: type
      },
      this.agentId,
      { priority: options.priority || 5 }
    );
  }

  /**
   * 全局广播
   */
  broadcast(type, data, options = {}) {
    return eventBus.publish(
      `broadcast:${type}`,
      {
        ...data,
        __from: this.agentId,
        __seq: globalSeq.next(),
        __type: type
      },
      this.agentId,
      { priority: options.priority || 3 }
    );
  }

  /**
   * 安全写文件（自动获取锁）
   */
  async safeWrite(filePath, content) {
    const lockAcquired = await fileLocks.acquireLock(this.agentId, filePath);
    
    if (!lockAcquired) {
      return { success: false, reason: 'lock_timeout' };
    }
    
    try {
      const dir = path.dirname(filePath);
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
      
      fs.writeFileSync(filePath, content, 'utf8');
      
      fileLocks.releaseLock(filePath);
      
      eventBus.publish('file:written', 
        { filePath, agentId: this.agentId, size: content.length },
        this.agentId, { priority: 5 }
      );
      
      return { success: true, size: content.length };
    } catch (error) {
      fileLocks.releaseLock(filePath);
      return { success: false, reason: error.message };
    }
  }

  /**
   * 安全读文件
   */
  safeRead(filePath) {
    try {
      if (!fs.existsSync(filePath)) return { success: false, reason: 'not_found' };
      const content = fs.readFileSync(filePath, 'utf8');
      return { success: true, content, size: content.length };
    } catch (error) {
      return { success: false, reason: error.message };
    }
  }

  /**
   * 确认收到消息
   */
  ack(eventId) {
    ackTracker.confirm(eventId, this.agentId);
  }
}

// ========== 初始化ACK监听 ==========
eventBus.subscribe('*', (event) => {
  if (event.payload?.__ackId && event.payload.__source !== 'event-bus') {
    // 自动ACK（Agent收到后手动调用ack()）
    // 这里只做日志记录
  }
});

module.exports = { 
  SequenceGenerator, 
  globalSeq, 
  FileLockManager, 
  fileLocks, 
  AckTracker, 
  ackTracker, 
  AgentProtocol 
};
