/**
 * 合约交易订单执行器
 * 集成 OKX 合约 API，支持限价/市价/conditional 订单
 */

const https = require('https');
const crypto = require('crypto');
const PositionManager = require('./position-manager');

class OrderExecutor {
  constructor(apiConfig) {
    this.apiKey = apiConfig.apiKey;
    this.secretKey = apiConfig.secretKey;
    this.passphrase = apiConfig.passphrase;
    this.testnet = apiConfig.testnet || false;
    this.positionManager = new PositionManager(apiConfig.redis);
    
    this.baseUrl = this.testnet
      ? 'https://www.okx.com'
      : 'https://www.okx.com';
  }

  /**
   * 签名生成
   */
  sign(timestamp, method, requestPath, body = '') {
    const str = timestamp + method + requestPath + body;
    return crypto.createHmac('sha256', this.secretKey).update(str).digest('base64');
  }

  /**
   * 发送请求
   */
  async request(method, path, body = null) {
    const timestamp = new Date().toISOString();
    const signature = this.sign(timestamp, method, path, body || '');
    
    const options = {
      method,
      headers: {
        'OK-ACCESS-KEY': this.apiKey,
        'OK-ACCESS-SIGN': signature,
        'OK-ACCESS-TIMESTAMP': timestamp,
        'OK-ACCESS-PASSPHRASE': this.passphrase,
        'Content-Type': 'application/json',
      },
    };

    return new Promise((resolve, reject) => {
      const url = this.baseUrl + path;
      const req = https.request(url, options, (res) => {
        let data = '';
        res.on('data', chunk => data += chunk);
        res.on('end', () => {
          try {
            resolve({ status: res.statusCode, data: JSON.parse(data) });
          } catch (e) {
            resolve({ status: res.statusCode, data });
          }
        });
      });

      req.on('error', reject);
      if (body) req.write(body);
      req.end();
    });
  }

  /**
   * 下单 (限价/市价)
   * @param {string} symbol - 交易对
   * @param {string} side - 'buy' | 'sell'
   * @param {string} orderType - 'limit' | 'market' | 'post_only' | 'fok' | 'ioc'
   * @param {number} size - 数量
   * @param {number} price - 价格 (市价可为null)
   * @param {string} posMode - 'long' | 'short' | 'net' (净仓)
   */
  async placeOrder(symbol, side, orderType, size, price = null, posMode = 'net') {
    const body = {
      instId: symbol,
      tdMode: 'cross', // 全仓，可改为 'isolated' 逐仓
      side,
      ordType: orderType,
      sz: size.toString(),
      clOrdId: `li_${Date.now()}_${Math.random().toString(36).substr(2, 8)}`,
    };

    if (orderType === 'limit' && price) {
      body.px = price.toString();
    }

    // 可选: 止损止盈
    // body.tpTriggerPx = '...';
    // body.slTriggerPx = '...';

    const response = await this.request('POST', '/api/v5/order', JSON.stringify(body));
    
    if (response.data.code === '0') {
      const order = response.data.data[0];
      // 记录订单到Redis
      await this.saveOrder(order);
      return order;
    } else {
      throw new Error(`Order failed: ${response.data.msg}`);
    }
  }

  /**
   * 市价开多 (快速买入)
   */
  async marketBuy(symbol, size) {
    return this.placeOrder(symbol, 'buy', 'market', size);
  }

  /**
   * 市价开空 (快速卖出)
   */
  async marketSell(symbol, size) {
    return this.placeOrder(symbol, 'sell', 'market', size);
  }

  /**
   * 限价开多
   */
  async limitBuy(symbol, size, price) {
    return this.placeOrder(symbol, 'buy', 'limit', size, price);
  }

  /**
   * 限价开空
   */
  async limitSell(symbol, size, price) {
    return this.placeOrder(symbol, 'sell', 'limit', size, price);
  }

  /**
   * 平仓订单 (根据持仓方向自动选择)
   */
  async closePositionOrder(symbol, side, size, price = null, orderType = 'market') {
    const closeSide = side === 'long' ? 'sell' : 'buy';
    return this.placeOrder(symbol, closeSide, orderType, size, price);
  }

  /**
   * 查询订单状态
   */
  async getOrder(symbol, orderId) {
    const response = await this.request('GET', `/api/v5/order/${orderId}?instId=${symbol}`);
    if (response.data.code === '0') {
      return response.data.data[0];
    } else {
      throw new Error(`Get order failed: ${response.data.msg}`);
    }
  }

  /**
   * 取消订单
   */
  async cancelOrder(symbol, orderId) {
    const body = { instId: symbol, ordId: orderId };
    const response = await this.request('POST', '/api/v5/order/cancel-order', JSON.stringify(body));
    return response.data.code === '0';
  }

  /**
   * 批量取消
   */
  async cancelAllOrders(symbol) {
    const body = { instId: symbol };
    const response = await this.request('POST', '/api/v5/order/cancel-batch', JSON.stringify(body));
    return response.data.code === '0';
  }

  /**
   * 查询当前持仓 (OKX API)
   */
  async fetchPositions(symbol = null) {
    const query = symbol ? `?instId=${symbol}` : '';
    const response = await this.request('GET', `/api/v5/account/positions${query}`);
    if (response.data.code === '0') {
      return response.data.data;
    } else {
      throw new Error(`Fetch positions failed: ${response.data.msg}`);
    }
  }

  /**
   * 保存订单到Redis
   */
  async saveOrder(order) {
    const key = `order:${order.ordId}`;
    const value = {
      ...order,
      savedAt: Date.now(),
    };
    await this.redis.set(key, JSON.stringify(value));
    await this.redis.expire(key, 86400 * 7); // 7天过期
  }

  /**
   * 获取订单
   */
  async getOrderFromCache(orderId) {
    const key = `order:${orderId}`;
    const data = await this.redis.get(key);
    return data ? JSON.parse(data) : null;
  }

  /**
   * 自动执行开仓 -> 仓位更新流程
   */
  async executeOpen(symbol, side, size, price, leverage = 10, orderType = 'limit') {
    // 1. 下单
    const order = await this.placeOrder(symbol, side, orderType, size, price);
    
    // 2. 等待订单成交 (简单轮询)
    let filled = false;
    for (let i = 0; i < 30; i++) {
      const status = await this.getOrder(symbol, order.ordId);
      if (status.state === 'filled') {
        filled = true;
        // 3. 更新本地仓位
        const posSide = side === 'buy' ? 'long' : 'short';
        await this.positionManager.openPosition(
          symbol,
          posSide,
          parseFloat(size),
          parseFloat(price || status.avgPx),
          leverage,
          'cross'
        );
        break;
      }
      await new Promise(r => setTimeout(r, 1000));
    }

    if (!filled) {
      throw new Error(`Order not filled after 30s: ${order.ordId}`);
    }

    return { order, filled };
  }

  /**
   * 自动执行平仓
   */
  async executeClose(symbol, side, size, price = null, orderType = 'market') {
    const closeSide = side === 'long' ? 'sell' : 'buy';
    const order = await this.placeOrder(symbol, closeSide, orderType, size, price);
    
    // 等待成交
    let filled = false;
    for (let i = 0; i < 30; i++) {
      const status = await this.getOrder(symbol, order.ordId);
      if (status.state === 'filled') {
        filled = true;
        const posSide = side;
        await this.positionManager.closePosition(
          symbol,
          posSide,
          parseFloat(size),
          parseFloat(price || status.avgPx)
        );
        break;
      }
      await new Promise(r => setTimeout(r, 1000));
    }

    return { order, filled };
  }
}

module.exports = OrderExecutor;