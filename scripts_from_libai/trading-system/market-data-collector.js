#!/usr/bin/env node
/**
 * MarketDataCollector - 市场数据收集器
 * 多交易所数据聚合、清洗、异常检测
 * 作者: C李白 | 2026-04-02
 */

const WebSocket = require('ws');
const Redis = require('ioredis');

class MarketDataCollector {
  constructor(config = {}) {
    this.config = {
      exchanges: [
        {
          name: 'okx',
          wsUrl: 'wss://ws.okx.com:8443/ws/v5/public',
          channels: ['tickers', 'trades', 'candles'],
          symbols: ['BTC-USDT', 'ETH-USDT', 'SOL-USDT']
        },
        {
          name: 'binance',
          wsUrl: 'wss://stream.binance.com:9443/ws',
          channels: ['ticker', 'trade', 'kline'],
          symbols: ['btcusdt', 'ethusdt', 'solusdt']
        }
      ],
      redis: {
        host: process.env.REDIS_HOST || '127.0.0.1',
        port: process.env.REDIS_PORT || 6379
      },
      collection: {
        tickerInterval: 5000,    // 5秒
        tradeInterval: 100,      // 100ms
        candleInterval: 60000,   // 1分钟
        maxReconnectDelay: 30000
      },
      ...config
    };

    this.redis = null;
    this.connections = new Map();
    this.subscribers = new Map();
    this.isRunning = false;
    this.stats = {
      messagesReceived: 0,
      messagesPublished: 0,
      errors: 0,
      startTime: null
    };
  }

  /**
   * 启动数据收集器
   */
  async initialize() {
    console.log('[MarketDataCollector] 初始化市场数据收集器...');
    
    // 1. 连接Redis
    await this.connectRedis();
    
    // 2. 启动各交易所连接
    for (const exchange of this.config.exchanges) {
      await this.connectExchange(exchange);
    }
    
    // 3. 启动心跳
    this.startHeartbeat();
    
    this.isRunning = true;
    this.stats.startTime = Date.now();
    console.log('[MarketDataCollector] ✅ 初始化完成');
  }

  /**
   * 连接Redis
   */
  async connectRedis() {
    try {
      this.redis = new Redis({
        host: this.config.redis.host,
        port: this.config.redis.port,
        maxRetriesPerRequest: 3,
        retryDelayOnFailover: 100
      });
      
      this.redis.on('error', (err) => {
        console.error('[MarketDataCollector] Redis错误:', err.message);
        this.stats.errors++;
      });
      
      this.redis.on('connect', () => {
        console.log('[MarketDataCollector] Redis已连接');
      });
      
      // 测试连接
      await this.redis.ping();
      console.log('[MarketDataCollector] ✅ Redis连接成功');
    } catch (error) {
      console.error('[MarketDataCollector] Redis连接失败:', error.message);
      throw error;
    }
  }

  /**
   * 连接交易所
   */
  async connectExchange(exchangeConfig) {
    console.log(`[MarketDataCollector] 连接交易所: ${exchangeConfig.name}`);
    
    try {
      const ws = new WebSocket(exchangeConfig.wsUrl);
      this.connections.set(exchangeConfig.name, ws);
      
      ws.on('open', () => {
        console.log(`[MarketDataCollector] ${exchangeConfig.name} WebSocket已连接`);
        this.subscribeToChannels(ws, exchangeConfig);
      });
      
      ws.on('message', (data) => {
        this.handleMessage(exchangeConfig.name, data);
      });
      
      ws.on('error', (error) => {
        console.error(`[MarketDataCollector] ${exchangeConfig.name} WebSocket错误:`, error.message);
        this.stats.errors++;
      });
      
      ws.on('close', () => {
        console.log(`[MarketDataCollector] ${exchangeConfig.name} WebSocket断开，尝试重连...`);
        setTimeout(() => this.reconnectExchange(exchangeConfig), 5000);
      });
      
    } catch (error) {
      console.error(`[MarketDataCollector] 连接交易所${exchangeConfig.name}失败:`, error.message);
      this.stats.errors++;
    }
  }

  /**
   * 订阅频道
   */
  subscribeToChannels(ws, exchangeConfig) {
    const subscribeMessages = this.buildSubscribeMessages(exchangeConfig);
    
    for (const msg of subscribeMessages) {
      ws.send(JSON.stringify(msg));
      console.log(`[MarketDataCollector] ${exchangeConfig.name} 已订阅: ${msg.args?.[0]?.instId || msg.channel}`);
    }
  }

  /**
   * 构建订阅消息 (交易所特定格式)
   */
  buildSubscribeMessages(exchangeConfig) {
    const messages = [];
    
    if (exchangeConfig.name === 'okx') {
      // OKX格式
      for (const symbol of exchangeConfig.symbols) {
        if (exchangeConfig.channels.includes('tickers')) {
          messages.push({
            op: 'subscribe',
            args: [{ instId: symbol, channel: 'tickers' }]
          });
        }
        if (exchangeConfig.channels.includes('trades')) {
          messages.push({
            op: 'subscribe',
            args: [{ instId: symbol, channel: 'trades' }]
          });
        }
        if (exchangeConfig.channels.includes('candles')) {
          messages.push({
            op: 'subscribe',
            args: [{ instId: symbol, channel: 'candle1m' }]
          });
        }
      }
    } else if (exchangeConfig.name === 'binance') {
      // Binance格式
      for (const symbol of exchangeConfig.symbols) {
        if (exchangeConfig.channels.includes('ticker')) {
          messages.push({
            method: 'SUBSCRIBE',
            params: [`${symbol}@ticker`]
          });
        }
        if (exchangeConfig.channels.includes('trade')) {
          messages.push({
            method: 'SUBSCRIBE',
            params: [`${symbol}@trade`]
          });
        }
        if (exchangeConfig.channels.includes('kline')) {
          messages.push({
            method: 'SUBSCRIBE',
            params: [`${symbol}@kline_1m`]
          });
        }
      }
    }
    
    return messages;
  }

  /**
   * 处理接收到的消息
   */
  handleMessage(exchangeName, rawData) {
    try {
      this.stats.messagesReceived++;
      
      const data = JSON.parse(rawData);
      
      // 数据清洗和归一化
      const normalized = this.normalizeData(exchangeName, data);
      
      if (normalized) {
        // 发布到Redis
        this.publishToRedis(normalized);
      }
      
    } catch (error) {
      console.error(`[MarketDataCollector] 处理${exchangeName}消息失败:`, error.message);
      this.stats.errors++;
    }
  }

  /**
   * 数据归一化 (统一格式)
   */
  normalizeData(exchangeName, raw) {
    try {
      let normalized = {
        exchange: exchangeName,
        timestamp: Date.now(),
        receivedAt: new Date().toISOString()
      };
      
      if (exchangeName === 'okx') {
        if (raw.table === 'tickers' && raw.data) {
          const ticker = raw.data[0];
          normalized.type = 'ticker';
          normalized.symbol = ticker.instId;
          normalized.last = parseFloat(ticker.last);
          normalized.bid = parseFloat(ticker.bidPx);
          normalized.ask = parseFloat(ticker.askPx);
          normalized.volume24h = parseFloat(ticker.vol24h);
          normalized.change24h = parseFloat(ticker.chg24h);
        } else if (raw.table === 'trades' && raw.data) {
          const trade = raw.data[0];
          normalized.type = 'trade';
          normalized.symbol = trade.instId;
          normalized.price = parseFloat(trade.px);
          normalized.size = parseFloat(trade.sz);
          normalized.side = trade.side; // buy/sell
          normalized.tradeId = trade.tradeId;
        } else if (raw.table === 'candle' && raw.data) {
          const candle = raw.data[0];
          normalized.type = 'candle';
          normalized.symbol = candle.instId;
          normalized.interval = candle.bar; // 1m
          normalized.open = parseFloat(candle.o);
          normalized.high = parseFloat(candle.h);
          normalized.low = parseFloat(candle.l);
          normalized.close = parseFloat(candle.c);
          normalized.volume = parseFloat(candle.vol);
          normalized.epoch = parseInt(candle.ts);
        }
      } else if (exchangeName === 'binance') {
        if (raw.e === '24hrTicker') {
          normalized.type = 'ticker';
          normalized.symbol = raw.s.toLowerCase();
          normalized.last = parseFloat(raw.c);
          normalized.bid = parseFloat(raw.b);
          normalized.ask = parseFloat(raw.a);
          normalized.volume24h = parseFloat(raw.v);
          normalized.change24h = parseFloat(raw.P);
        } else if (raw.e === 'trade') {
          normalized.type = 'trade';
          normalized.symbol = raw.s.toLowerCase();
          normalized.price = parseFloat(raw.p);
          normalized.size = parseFloat(raw.q);
          normalized.side = raw.m === true ? 'sell' : 'buy';
          normalized.tradeId = raw.t;
        } else if (raw.e === 'kline') {
          const k = raw.k;
          normalized.type = 'candle';
          normalized.symbol = raw.s.toLowerCase();
          normalized.interval = k.i; // 1m
          normalized.open = parseFloat(k.o);
          normalized.high = parseFloat(k.h);
          normalized.low = parseFloat(k.l);
          normalized.close = parseFloat(k.c);
          normalized.volume = parseFloat(k.v);
          normalized.epoch = k.t;
        }
      }
      
      // 数据验证
      if (!this.validateData(normalized)) {
        return null;
      }
      
      return normalized;
      
    } catch (error) {
      console.error(`[MarketDataCollector] 归一化数据失败:`, error.message);
      return null;
    }
  }

  /**
   * 数据验证
   */
  validateData(data) {
    // 必要字段检查
    if (!data.type || !data.symbol || !data.timestamp) {
      return false;
    }
    
    // 数值范围检查
    if (data.type === 'ticker') {
      if (data.last && (data.last <= 0 || data.last > 1000000)) return false;
    }
    
    if (data.type === 'trade') {
      if (data.price && (data.price <= 0 || data.price > 1000000)) return false;
      if (data.size && data.size <= 0) return false;
    }
    
    if (data.type === 'candle') {
      if (data.high < data.low) return false;
      if (data.open > data.high || data.open < data.low) return false;
      if (data.close > data.high || data.close < data.low) return false;
    }
    
    return true;
  }

  /**
   * 发布到Redis
   */
  async publishToRedis(data) {
    try {
      const channel = `market:${data.exchange}:${data.symbol}:${data.type}`;
      const message = JSON.stringify(data);
      
      await this.redis.publish(channel, message);
      
      // 同时存储最新数据到hash
      const key = `market:${data.exchange}:${data.symbol}:latest`;
      await this.redis.hmset(key, {
        data: message,
        updatedAt: Date.now()
      });
      await this.redis.expire(key, 3600); // 1小时过期
      
      this.stats.messagesPublished++;
      
    } catch (error) {
      console.error('[MarketDataCollector] Redis发布失败:', error.message);
      this.stats.errors++;
    }
  }

  /**
   * 重连交易所
   */
  async reconnectExchange(exchangeConfig) {
    const existing = this.connections.get(exchangeConfig.name);
    if (existing) {
      existing.terminate();
      this.connections.delete(exchangeConfig.name);
    }
    
    await this.connectExchange(exchangeConfig);
  }

  /**
   * 启动心跳
   */
  startHeartbeat() {
    setInterval(() => {
      if (!this.isRunning) return;
      
      const uptime = Date.now() - this.stats.startTime;
      console.log(`[MarketDataCollector] 心跳 - 运行时间: ${Math.floor(uptime/1000)}s, 收到: ${this.stats.messagesReceived}, 发布: ${this.stats.messagesPublished}, 错误: ${this.stats.errors}`);
    }, 60000); // 每分钟
  }

  /**
   * 停止收集器
   */
  async shutdown() {
    console.log('[MarketDataCollector] 正在关闭...');
    this.isRunning = false;
    
    // 关闭所有WebSocket连接
    for (const [name, ws] of this.connections) {
      ws.close();
      console.log(`[MarketDataCollector] ${name}连接已关闭`);
    }
    
    // 关闭Redis
    if (this.redis) {
      await this.redis.quit();
      console.log('[MarketDataCollector] Redis已断开');
    }
    
    console.log('[MarketDataCollector] ✅ 已关闭');
  }

  /**
   * 获取统计信息
   */
  getStats() {
    return {
      running: this.isRunning,
      uptime: Date.now() - this.stats.startTime,
      messagesReceived: this.stats.messagesReceived,
      messagesPublished: this.stats.messagesPublished,
      errors: this.stats.errors,
      connections: Array.from(this.connections.keys()),
      redisConnected: this.redis ? true : false
    };
  }
}

module.exports = MarketDataCollector;
