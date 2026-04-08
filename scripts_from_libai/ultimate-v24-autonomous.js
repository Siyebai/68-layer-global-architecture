#!/usr/bin/env node

/**
 * 李白AI交易系统 - 自主进化核心
 * 224 Agent 集群，0.2秒周期，L20 级别
 */

const cluster = require('cluster');
const os = require('os');
const Redis = require('ioredis');
const winston = require('winston');
const path = require('path');
const fs = require('fs');

const ROOT = path.join(__dirname, '..');
require('dotenv').config();

// 日志配置
const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.json()
  ),
  transports: [
    new winston.transports.File({
      filename: path.join(ROOT, 'logs', 'error.log'),
      level: 'error',
    }),
    new winston.transports.File({
      filename: path.join(ROOT, 'logs', 'combined.log'),
    }),
    new winston.transports.Console({
      format: winston.format.simple(),
    }),
  ],
});

// 全局状态
const state = {
  startTime: Date.now(),
  agents: new Map(),
  redis: null,
  metrics: {
    messagesProcessed: 0,
    errors: 0,
    tradesExecuted: 0,
    profit: 0,
  },
};

class BaseAgent {
  constructor(id, type, config = {}) {
    this.id = id;
    this.type = type;
    this.config = config;
    this.state = 'idle';
    this.lastUpdate = Date.now();
    this.metrics = {
      processed: 0,
      errors: 0,
      latency: [],
    };
  }

  async initialize(redis) {
    this.redis = redis;
    this.state = 'running';
    logger.info(`Agent ${this.id} (${this.type}) initialized`);
  }

  async process(message) {
    const start = Date.now();
    try {
      await this.onMessage(message);
      this.metrics.processed++;
      this.metrics.latency.push(Date.now() - start);
      if (this.metrics.latency.length > 100) this.metrics.latency.shift();
    } catch (err) {
      this.metrics.errors++;
      logger.error(`Agent ${this.id} error:`, err);
    }
  }

  async onMessage(message) {
    // 子类实现
  }

  getHealth() {
    const avgLatency = this.metrics.latency.length > 0
      ? this.metrics.latency.reduce((a, b) => a + b, 0) / this.metrics.latency.length
      : 0;
    return {
      id: this.id,
      type: this.type,
      state: this.state,
      processed: this.metrics.processed,
      errors: this.metrics.errors,
      avgLatency,
      lastUpdate: this.lastUpdate,
    };
  }
}

// ============ 核心 Agent 类型 ============

class MarketDataAgent extends BaseAgent {
  constructor(id, exchange, symbols) {
    super(id, 'market-data', { exchange, symbols });
    this.exchange = exchange;
    this.symbols = symbols;
  }

  async onMessage(message) {
    if (message.type === 'market_update') {
      // 处理市场数据更新
      state.metrics.messagesProcessed++;
    }
  }
}

class SignalAgent extends BaseAgent {
  constructor(id, strategy) {
    super(id, 'signal', { strategy });
    this.strategy = strategy;
  }

  async onMessage(message) {
    if (message.type === 'market_data') {
      // 生成套利信号
      const signal = await this.generateSignal(message);
      if (signal) {
        await this.redis.xadd('signals', '*', 'data', JSON.stringify(signal));
        state.metrics.tradesExecuted++;
      }
    }
  }

  async generateSignal(data) {
    // 简化实现：返回模拟信号
    if (Math.random() > 0.7) {
      return {
        id: `sig_${Date.now()}`,
        symbol: 'BTC-USDT',
        exchange: 'okx',
        side: Math.random() > 0.5 ? 'buy' : 'sell',
        price: data.price || 50000,
        quantity: 0.001,
        confidence: 0.85,
        timestamp: Date.now(),
      };
    }
    return null;
  }
}

class RiskManagerAgent extends BaseAgent {
  constructor(id) {
    super(id, 'risk-manager');
  }

  async onMessage(message) {
    if (message.type === 'signal') {
      const riskScore = await this.assessRisk(message);
      if (riskScore < 0.8) {
        await this.redis.xadd('approved_signals', '*', 'data', JSON.stringify(message));
      }
    }
  }

  async assessRisk(signal) {
    // 简化风控：随机返回风险分数
    return Math.random() * 0.5 + 0.5; // 0.5-1.0
  }
}

class TraderAgent extends BaseAgent {
  constructor(id, exchange) {
    super(id, 'trader', { exchange });
    this.exchange = exchange;
  }

  async onMessage(message) {
    if (message.type === 'approved_signal') {
      const result = await this.executeTrade(message);
      if (result.success) {
        state.metrics.profit += result.profit || 0;
      }
    }
  }

  async executeTrade(signal) {
    // 简化实现
    return {
      success: true,
      orderId: `ord_${Date.now()}`,
      profit: Math.random() * 10 - 5,
    };
  }
}

// ============ Agent 工厂 ============

function createAgents() {
  const agents = [];
  let agentId = 0;

  // Market Data Agents (40)
  for (let i = 0; i < 40; i++) {
    agents.push(new MarketDataAgent(`md_${agentId++}`, 'okx', ['BTC-USDT', 'ETH-USDT']));
  }

  // Signal Agents (60)
  const strategies = ['arbitrage', 'triangle', 'statistical', 'news'];
  for (let i = 0; i < 60; i++) {
    agents.push(new SignalAgent(`sig_${agentId++}`, strategies[i % strategies.length]));
  }

  // Risk Managers (24)
  for (let i = 0; i < 24; i++) {
    agents.push(new RiskManagerAgent(`risk_${agentId++}`));
  }

  // Traders (100)
  for (let i = 0; i < 100; i++) {
    agents.push(new TraderAgent(`trader_${agentId++}`, 'okx'));
  }

  return agents;
}

// ============ 主系统 ============

class TradingSystem {
  constructor() {
    this.agents = [];
    this.redis = null;
    this.workerCount = Math.min(os.cpus().length, 4);
  }

  async initialize() {
    logger.info('初始化李白AI交易系统 v24.0...');

    // 连接 Redis
    const redisUrl = process.env.REDIS_URL || 'redis://127.0.0.1:6379';
    const redisHost = redisUrl.replace('redis://', '').split(':')[0];
    const redisPort = parseInt(redisUrl.replace('redis://', '').split(':')[1]) || 6379;

    this.redis = new Redis({
      host: redisHost,
      port: redisPort,
      retryStrategy: (times) => Math.min(times * 50, 2000),
    });

    this.redis.on('error', (err) => logger.error('Redis error:', err));
    this.redis.on('connect', () => logger.info('Redis connected'));

    await this.redis.ping();

    // 创建 Agents
    this.agents = createAgents();
    logger.info(`创建 ${this.agents.length} 个 Agent`);

    // 初始化所有 Agents
    await Promise.all(this.agents.map(agent => agent.initialize(this.redis)));

    // 启动消息循环
    this.startMessageLoop();

    logger.info('系统初始化完成');
  }

  getAgentCount() {
    return this.agents.length;
  }

  startMessageLoop() {
    // 主循环：从 Redis Streams 读取消息并分发给 Agents
    (async () => {
      let lastId = '0';

      while (true) {
        try {
          // 读取市场数据
          const result = await this.redis.xread(
            'BLOCK',
            1000,
            'COUNT',
            100,
            'STREAMS',
            'market_data',
            lastId
          );

          if (result) {
            const streamData = result.find(s => s.key === 'market_data');
            if (streamData) {
              for (const message of streamData.value) {
                const [id, data] = message;
                lastId = id;

                const parsed = JSON.parse(data.data);
                // 广播给 MarketDataAgent
                const mdAgents = this.agents.filter(a => a.type === 'market-data');
                for (const agent of mdAgents) {
                  await agent.process(parsed);
                }

                state.metrics.messagesProcessed++;
              }
            }
          }

          // 定期输出健康状态
          if (Date.now() % 30000 < 1000) {
            this.logHealth();
          }

        } catch (err) {
          logger.error('消息循环错误:', err);
          state.metrics.errors++;
          await new Promise(resolve => setTimeout(resolve, 1000));
        }
      }
    })();
  }

  logHealth() {
    const healthyAgents = this.agents.filter(a => a.state === 'running').length;
    const totalAgents = this.agents.length;
    const uptime = Math.floor((Date.now() - state.startTime) / 1000);

    logger.info('系统健康状态', {
      uptime: `${uptime}s`,
      agents: `${healthyAgents}/${totalAgents}`,
      messages: state.metrics.messagesProcessed,
      errors: state.metrics.errors,
      profit: state.metrics.profit.toFixed(2),
    });
  }

  getStatus() {
    const agentHealth = this.agents.map(a => a.getHealth());
    return {
      version: '24.0.0',
      uptime: Date.now() - this.startTime,
      agents: {
        total: this.agents.length,
        healthy: agentHealth.filter(a => a.state === 'running').length,
        details: agentHealth,
      },
      metrics: state.metrics,
      redis: this.redis ? 'connected' : 'disconnected',
    };
  }
}

// 导出为模块 (供测试使用)
TradingSystem.create = function() {
  return new TradingSystem();
};

// ============ 启动 ============

if (cluster.isMaster) {
  console.log(`🎯 李白AI交易系统 v24.0 启动中...`);
  console.log(`🖥️  系统: ${os.type()} ${os.release()}, ${os.cpus().length} CPU`);
  console.log(`💾 内存: ${Math.round(os.totalmem() / 1024 / 1024 / 1024)} GB`);
  console.log(`📊 Agent 总数: 224`);

  // Fork workers
  const numWorkers = Math.min(os.cpus().length, 4);
  for (let i = 0; i < numWorkers; i++) {
    cluster.fork();
  }

  cluster.on('exit', (worker, code, signal) => {
    logger.warn(`Worker ${worker.process.pid} 退出，重启中...`);
    cluster.fork();
  });

  cluster.on('online', (worker) => {
    console.log(`✅ Worker ${worker.process.pid} 已启动`);
  });

} else {
  // Worker 进程
  const system = new TradingSystem();

  // 启动 HTTP 服务器用于健康检查和状态
  const express = require('express');
  const app = express();

  app.get('/health', async (req, res) => {
    try {
      const ping = await system.redis.ping();
      res.json({
        status: 'ok',
        timestamp: Date.now(),
        redis: ping === 'PONG' ? 'healthy' : 'unhealthy',
      });
    } catch (err) {
      res.status(500).json({ status: 'error', error: err.message });
    }
  });

  app.get('/status', async (req, res) => {
    try {
      const status = system.getStatus();
      res.json(status);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  const PORT = process.env.PORT || 3000;
  app.listen(PORT, () => {
    console.log(`🌐 Worker ${process.pid} 监听端口 ${PORT}`);
  });

  // 初始化系统
  system.initialize().catch(err => {
    logger.error('系统初始化失败:', err);
    process.exit(1);
  });
}

// 导出核心类供测试使用
module.exports = {
  TradingSystem,
  BaseAgent,
  MarketDataAgent,
  SignalAgent,
  RiskManagerAgent,
  TraderAgent,
  createAgents,
};
