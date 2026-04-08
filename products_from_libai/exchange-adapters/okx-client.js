/**
 * OKX 交易所客户端
 * 支持 REST API 和 WebSocket 市场数据
 */

const crypto = require('crypto');
const axios = require('axios');
const WebSocket = require('ws');
const { EventEmitter } = require('events');

class OKXClient extends EventEmitter {
  constructor(config = {}) {
    super();
    this.apiKey = config.apiKey || (process.env.OKX_API_KEY ? process.env.OKX_API_KEY.trim() : null);
    this.secretKey = config.secretKey || (process.env.OKX_SECRET_KEY ? process.env.OKX_SECRET_KEY.trim() : null);
    this.passphrase = config.passphrase || (process.env.OKX_PASSPHRASE ? process.env.OKX_PASSPHRASE.trim() : null);
    this.restUrl = config.restApi || 'https://www.okx.com';
    this.wsUrl = config.wsApi || 'wss://ws.okx.com:8443/ws/v5/public';
    this.timeout = config.timeout || 5000;
    
    // 验证密钥
    this.mockMode = !(this.apiKey && this.secretKey && this.passphrase);
    if (this.mockMode) {
      console.warn('[OKX] API credentials incomplete. Using mock mode.');
    }

    // 创建 REST 客户端
    this.restClient = axios.create({
      baseURL: this.restUrl,
      timeout: this.timeout,
      headers: {
        'Content-Type': 'application/json'
      }
    });

    // 设置认证拦截器
    this._setupAuth();

    this.ws = null;
    this.subscriptions = new Set();
  }

  _setupAuth() {
    this.restClient.interceptors.request.use(async (config) => {
      // 模拟模式跳过认证
      if (this.mockMode) return config;
      
      try {
        const timestamp = Date.now().toString();
        const sign = this._sign(config.method.toUpperCase(), config.url, timestamp, config.data || '');

        config.headers['OK-ACCESS-KEY'] = this.apiKey;
        config.headers['OK-ACCESS-SIGN'] = sign;
        config.headers['OK-ACCESS-TIMESTAMP'] = timestamp;
        config.headers['OK-ACCESS-PASSPHRASE'] = this.passphrase;
      } catch (err) {
        console.error('[OKX] Auth setup error:', err.message);
      }

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
   * 获取账户余额
   */
  async getBalance(currency = 'USDT') {
    if (this.mockMode) {
      return { ccy: currency, bal: '10000.00', availBal: '8000.00' };
    }

    try {
      const response = await this.restClient.get('/api/v5/account/balance', {
        params: { ccy: currency },
      });
      return response.data.data[0]?.details?.[0] || null;
    } catch (err) {
      console.error('[OKX] getBalance error:', err.message);
      return null;
    }
  }

  /**
   * 获取交易对行情
   */
  async getTicker(symbol) {
    if (this.mockMode) {
      // 模拟数据
      const prices = {
        'BTC-USDT': 45000 + Math.random() * 1000,
        'ETH-USDT': 3000 + Math.random() * 100,
        'SOL-USDT': 100 + Math.random() * 10,
        'EOS-USDT': 1 + Math.random() * 0.1
      };
      const price = prices[symbol] || 100;
      return {
        instId: symbol,
        last: price.toFixed(2),
        bidPx: (price * 0.999).toFixed(2),
        askPx: (price * 1.001).toFixed(2),
        vol24h: Math.floor(Math.random() * 10000 + 1000)
      };
    }

    try {
      const response = await this.restClient.get('/api/v5/market/ticker', {
        params: { instId: symbol },
      });
      return response.data.data[0];
    } catch (err) {
      console.error('[OKX] getTicker error:', err.message);
      // 出错时返回模拟数据
      const price = 100;
      return {
        instId: symbol,
        last: price.toFixed(2),
        bidPx: (price * 0.999).toFixed(2),
        askPx: (price * 1.001).toFixed(2),
        vol24h: Math.floor(Math.random() * 10000 + 1000)
      };
    }
  }

  /**
   * 获取深度
   */
  async getOrderBook(symbol, sz = 400) {
    if (this.mockMode) {
      return {
        instId: symbol,
        bids: [[100, 1], [99, 2]],
        asks: [[101, 1], [102, 2]],
        ts: Date.now()
      };
    }

    try {
      const response = await this.restClient.get('/api/v5/market/books', {
        params: { instId: symbol, sz },
      });
      return response.data.data[0];
    } catch (err) {
      console.error('[OKX] getOrderBook error:', err.message);
      return null;
    }
  }

  /**
   * 下单
   */
  async placeOrder(params) {
    if (this.mockMode) {
      return {
        ordId: 'mock_' + Date.now(),
        clOrdId: 'mock_client_' + Date.now(),
        tag: 'mock',
        sCode: '0',
        sMsg: 'Order placed successfully',
        instId: params.instId,
        side: params.side,
        ordType: params.ordType,
        sz: params.sz,
        px: params.px,
        state: 'filled'
      };
    }

    const {
      instId,
      side,
      ordType,
      sz,
      px = null,
    } = params;

    const orderParams = {
      instId,
      tdMode: 'cash',
      side,
      ordType,
      sz,
      ...(px && { px }),
    };

    try {
      const response = await this.restClient.post('/api/v5/trade/order', orderParams);
      return response.data.data[0];
    } catch (err) {
      console.error('[OKX] placeOrder error:', err.message);
      return null;
    }
  }

  /**
   * 取消订单
   */
  async cancelOrder(instId, ordId) {
    if (this.mockMode) {
      return { ordId, sCode: '0', sMsg: 'Order cancelled' };
    }

    try {
      const response = await this.restClient.post('/api/v5/trade/cancel-order', {
        instId,
        ordId,
      });
      return response.data.data[0];
    } catch (err) {
      console.error('[OKX] cancelOrder error:', err.message);
      return null;
    }
  }

  /**
   * 获取订单状态
   */
  async getOrderStatus(instId, ordId) {
    if (this.mockMode) {
      return {
        ordId,
        state: 'filled',
        instId,
        side: 'buy',
        ordType: 'market',
        sz: '1',
        filledSz: '1',
      };
    }

    try {
      const response = await this.restClient.get('/api/v5/trade/order', {
        params: { instId, ordId },
      });
      return response.data.data[0];
    } catch (err) {
      console.error('[OKX] getOrderStatus error:', err.message);
      return null;
    }
  }

  /**
   * 获取未成交订单
   */
  async getOpenOrders(instId = '') {
    if (this.mockMode) {
      return [];
    }

    const params = {};
    if (instId) params.instId = instId;

    try {
      const response = await this.restClient.get('/api/v5/trade/orders-pending', { params });
      return response.data.data;
    } catch (err) {
      console.error('[OKX] getOpenOrders error:', err.message);
      return [];
    }
  }

  /**
   * WebSocket 连接
   */
  connectWebSocket() {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      return this.ws;
    }

    this.ws = new WebSocket(this.wsUrl);

    this.ws.on('open', () => {
      console.log('[OKX] WebSocket connected');
      if (!this.mockMode) {
        this._authenticateWS();
      }
    });

    this.ws.on('message', (data) => {
      try {
        const msg = JSON.parse(data);
        if (msg.event === 'error') {
          this.emit('error', msg.msg);
        } else if (msg.event === 'subscribe') {
          console.log(`[OKX] Subscribed to ${msg.arg?.instId || msg.arg?.channel}`);
        } else if (msg.data) {
          this._handleMarketData(msg);
        }
      } catch (err) {
        console.error('[OKX] Failed to parse message:', err);
      }
    });

    this.ws.on('close', () => {
      console.log('[OKX] WebSocket closed, reconnecting in 5s...');
      setTimeout(() => this.connectWebSocket(), 5000);
    });

    this.ws.on('error', (err) => {
      console.error('[OKX] WebSocket error:', err);
      this.emit('error', err);
    });

    return this.ws;
  }

  _authenticateWS() {
    if (this.mockMode) return;

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
    }
  }

  /**
   * 测试连接
   */
  async ping() {
    if (this.mockMode) return true;
    
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

module.exports = OKXClient;
