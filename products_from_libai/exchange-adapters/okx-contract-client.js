/**
 * OKX 合约交易客户端
 * 支持: 永续合约、交割合约、杠杆交易、多空操作
 */

const crypto = require('crypto');
const axios = require('axios');
const WebSocket = require('ws');
const { EventEmitter } = require('events');

class OKXContractClient extends EventEmitter {
  constructor(config = {}) {
    super();
    this.apiKey = config.apiKey || process.env.OKX_API_KEY;
    this.secretKey = config.secretKey || process.env.OKX_SECRET_KEY;
    this.passphrase = config.passphrase || process.env.OKX_PASSPHRASE;
    this.restUrl = config.restApi || 'https://www.okx.com';
    this.wsUrl = config.wsApi || 'wss://ws.okx.com:8443/ws/v5/private';
    this.timeout = config.timeout || 5000;

    this.restClient = axios.create({
      baseURL: this.restUrl,
      timeout: this.timeout,
      headers: { 'Content-Type': 'application/json' },
    });

    this.ws = null;
    this.subscriptions = new Set();
    this._setupAuth();
  }

  _setupAuth() {
    this.restClient.interceptors.request.use(async (config) => {
      const timestamp = Date.now().toString();
      const sign = this._sign(config.method.toUpperCase(), config.url, timestamp, config.data || '');

      config.headers['OK-ACCESS-KEY'] = this.apiKey;
      config.headers['OK-ACCESS-SIGN'] = sign;
      config.headers['OK-ACCESS-TIMESTAMP'] = timestamp;
      config.headers['OK-ACCESS-PASSPHRASE'] = this.passphrase;

      return config;
    });
  }

  _sign(method, requestPath, timestamp, body) {
    const message = timestamp + method + requestPath + (body || '');
    const hmac = crypto.createHmac('sha256', this.secretKey);
    hmac.update(message);
    return hmac.digest('base64');
  }

  /**
   * ==================== 账户操作 ====================
   */

  /**
   * 获取账户余额 (合约)
   */
  async getAccountBalance(ccy = 'USDT') {
    const response = await this.restClient.get('/api/v5/account/balance', {
      params: { ccy },
    });
    return response.data.data[0]?.details?.[0] || null;
  }

  /**
   * 获取持仓信息
   */
  async getPositions(instId = '') {
    const params = {};
    if (instId) params.instId = instId;
    const response = await this.restClient.get('/api/v5/account/positions', { params });
    return response.data.data;
  }

  /**
   * 设置杠杆倍数
   */
  async setLeverage(instId, leverage, side = 'net') {
    // side: net(双向持仓), long(仅多头), short(仅空头)
    const response = await this.restClient.post('/api/v5/account/set-leverage', {
      instId,
      lever: leverage,
      mgnMode: 'isolated', // 逐仓模式
      posSide: side,
    });
    return response.data.data[0];
  }

  /**
   * 获取杠杆倍数
   */
  async getLeverage(instId, side = 'net') {
    const response = await this.restClient.get('/api/v5/account/leverage-info', {
      params: { instId, posSide: side },
    });
    return response.data.data[0];
  }

  /**
   * 调整保证金
   */
  async adjustMargin(instId, side, amt, type = 'add') {
    const response = await this.restClient.post('/api/v5/account/position/margin-balance', {
      instId,
      posSide: side,
      type, // add(增加) or reduce(减少)
      amt,
    });
    return response.data.data[0];
  }

  /**
   * ==================== 订单操作 ====================
   */

  /**
   * 下单 (合约)
   * @param {Object} params
   * @param {string} params.instId - 交易对 (e.g., BTC-USDT-SWAP)
   * @param {string} params.side - buy/sell
   * @param {string} params.ordType - limit/market/post_only
   * @param {string} params.posSide - long(多头)/short(空头)/net(双向)
   * @param {string} params.sz - 数量 (合约张数)
   * @param {number} [params.px] - 价格 (limit订单需要)
   * @param {number} [params.tdMode] - 保证金模式: isolated(逐仓)/cross(全仓)
   */
  async placeOrder(params) {
    const {
      instId,
      side,
      ordType,
      posSide = 'net',
      sz,
      px = null,
      tdMode = 'isolated',
    } = params;

    const orderParams = {
      instId,
      tdMode, // isolated 或 cross
      side,
      ordType,
      sz,
      posSide,
      ...(px && { px }),
    };

    const response = await this.restClient.post('/api/v5/trade/order', orderParams);
    return response.data.data[0];
  }

  /**
   * 批量下单
   */
  async batchOrders(orders) {
    const response = await this.restClient.post('/api/v5/trade/batch-orders', { orders });
    return response.data.data;
  }

  /**
   * 取消订单
   */
  async cancelOrder(instId, ordId) {
    const response = await this.restClient.post('/api/v5/trade/cancel-order', {
      instId,
      ordId,
    });
    return response.data.data[0];
  }

  /**
   * 批量取消
   */
  async batchCancel(instId, ordIds) {
    const response = await this.restClient.post('/api/v5/trade/batch-cancel-orders', {
      instId,
      ordIds,
    });
    return response.data.data;
  }

  /**
   * 获取订单状态
   */
  async getOrderStatus(instId, ordId) {
    const response = await this.restClient.get('/api/v5/trade/order', {
      params: { instId, ordId },
    });
    return response.data.data[0];
  }

  /**
   * 获取未成交订单
   */
  async getOpenOrders(instId = '') {
    const params = { instType: 'SWAP' }; // SWAP=永续, FUTURES=交割
    if (instId) params.instId = instId;
    const response = await this.restClient.get('/api/v5/trade/orders-pending', { params });
    return response.data.data;
  }

  /**
   * 获取历史订单
   */
  async getHistoryOrders(instId, limit = 100, startTime, endTime) {
    const params = {
      instType: 'SWAP',
      instId,
      limit,
    };
    if (startTime) params.startTime = startTime;
    if (endTime) params.endTime = endTime;
    const response = await this.restClient.get('/api/v5/trade/order-history', { params });
    return response.data.data;
  }

  /**
   * ==================== 行情数据 ====================
   */

  /**
   * 获取合约行情
   */
  async getTicker(symbol) {
    const response = await this.restClient.get('/api/v5/market/ticker', {
      params: { instId: symbol },
    });
    return response.data.data[0];
  }

  /**
   * 获取深度
   */
  async getOrderBook(symbol, sz = 400) {
    const response = await this.restClient.get('/api/v5/market/books', {
      params: { instId: symbol, sz },
    });
    return response.data.data[0];
  }

  /**
   * 获取K线数据
   */
  async getCandles(symbol, bar = '1m', limit = 100) {
    const response = await this.restClient.get('/api/v5/market/candles', {
      params: { instId: symbol, bar, limit },
    });
    // 返回: [[ts, o, h, l, c, vol, volCcy], ...]
    return response.data.data.map(d => ({
      timestamp: parseInt(d[0]),
      open: parseFloat(d[1]),
      high: parseFloat(d[2]),
      low: parseFloat(d[3]),
      close: parseFloat(d[4]),
      volume: parseFloat(d[5]),
      volumeCcy: parseFloat(d[6]),
    })).reverse();
  }

  /**
   * 获取资金费率
   */
  async getFundingRate(symbol) {
    const response = await this.restClient.get('/api/v5/public/funding-rate', {
      params: { instId: symbol },
    });
    return response.data.data[0];
  }

  /**
   * 获取合约信息
   */
  async getInstrumentInfo(symbol) {
    const response = await this.restClient.get('/api/v5/public/instruments', {
      params: { instType: 'SWAP', instId: symbol },
    });
    return response.data.data[0];
  }

  /**
   * ==================== WebSocket ====================
   */

  connectWebSocket() {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      return this.ws;
    }

    this.ws = new WebSocket(this.wsUrl);

    this.ws.on('open', () => {
      console.log('[OKXContract] WebSocket connected');
      this._authenticateWS();
    });

    this.ws.on('message', (data) => {
      try {
        const msg = JSON.parse(data);
        if (msg.event === 'error') {
          this.emit('error', msg.msg);
        } else if (msg.event === 'subscribe') {
          console.log(`[OKXContract] Subscribed to ${msg.arg?.instId || msg.arg?.channel}`);
        } else if (msg.data) {
          this._handleMarketData(msg);
        }
      } catch (err) {
        console.error('[OKXContract] Failed to parse message:', err);
      }
    });

    this.ws.on('close', () => {
      console.log('[OKXContract] WebSocket closed, reconnecting in 5s...');
      setTimeout(() => this.connectWebSocket(), 5000);
    });

    this.ws.on('error', (err) => {
      this.emit('error', err);
    });

    return this.ws;
  }

  _authenticateWS() {
    const timestamp = Date.now().toString();
    const sign = this._sign('GET', '/users/self/verify', timestamp, '');
    const authMsg = {
      op: 'login',
      args: [{
        apiKey: this.apiKey,
        sign,
        passphrase: this.passphrase,
        timestamp,
      }],
    };
    this.ws.send(JSON.stringify(authMsg));
  }

  /**
   * 订阅市场数据
   */
  subscribe(symbol, channel = 'tickers') {
    const msg = {
      op: 'subscribe',
      args: [{ instId: symbol, channel }],
    };
    this.ws.send(JSON.stringify(msg));
    this.subscriptions.add(`${symbol}:${channel}`);
  }

  /**
   * 订阅账户更新
   */
  subscribeAccount() {
    const msg = {
      op: 'subscribe',
      args: [{ channel: 'account' }, { channel: 'positions', instType: 'SWAP' }],
    };
    this.ws.send(JSON.stringify(msg));
  }

  unsubscribe(symbol, channel = 'tickers') {
    const msg = {
      op: 'unsubscribe',
      args: [{ instId: symbol, channel }],
    };
    this.ws.send(JSON.stringify(msg));
    this.subscriptions.delete(`${symbol}:${channel}`);
  }

  _handleMarketData(msg) {
    if (msg.table === 'tickers') {
      const ticker = msg.data[0];
      this.emit('ticker', {
        symbol: ticker.instId,
        last: parseFloat(ticker.last),
        bid: parseFloat(ticker.bidPx),
        ask: parseFloat(ticker.askPx),
        volume: parseFloat(ticker.vol24h),
        timestamp: Date.now(),
      });
    } else if (msg.table === 'books') {
      const book = msg.data[0];
      this.emit('orderbook', {
        symbol: book.instId,
        bids: book.bids.map(b => ({ price: parseFloat(b[0]), size: parseFloat(b[1]) })),
        asks: book.asks.map(a => ({ price: parseFloat(a[0]), size: parseFloat(a[1]) })),
        timestamp: Date.now(),
      });
    } else if (msg.table === 'candle') {
      const candle = msg.data[0];
      this.emit('candle', {
        symbol: candle.instId,
        timestamp: parseInt(candle.ts),
        open: parseFloat(candle.o),
        high: parseFloat(candle.h),
        low: parseFloat(candle.l),
        close: parseFloat(candle.c),
        volume: parseFloat(candle.vol),
      });
    } else if (msg.table === 'account') {
      this.emit('account', msg.data[0]);
    } else if (msg.table === 'position') {
      this.emit('position', msg.data[0]);
    }
  }

  /**
   * 测试连接
   */
  async ping() {
    try {
      const result = await this.restClient.get('/api/v5/public/time');
      return !!result.data && !!result.data.data[0]?.ts;
    } catch (err) {
      return false;
    }
  }

  disconnect() {
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
  }
}

module.exports = OKXContractClient;