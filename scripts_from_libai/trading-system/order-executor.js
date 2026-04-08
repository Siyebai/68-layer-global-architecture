#!/usr/bin/env node
/**
 * OrderExecutor - 订单执行器
 * 执行交易订单，管理订单生命周期
 * 作者: C李白 | 2026-04-02
 */

class OrderExecutor {
  constructor(exchangesConfig) {
    this.exchangesConfig = exchangesConfig;
    this.initialized = false;
    this.stats = {
      ordersSubmitted: 0,
      ordersFilled: 0,
      ordersCancelled: 0,
      activeOrders: 0,
      errors: 0
    };
    this.orders = new Map();
    this.positions = new Map();
    this.clients = new Map();
  }

  async initialize() {
    console.log('[OrderExecutor] 初始化订单执行器...');
    
    // 初始化交易所客户端 (模拟)
    for (const [name, config] of Object.entries(this.exchangesConfig)) {
      if (config.enabled) {
        this.clients.set(name, this.createMockClient(name, config));
      }
    }
    
    this.initialized = true;
    console.log('✅ 订单执行器已就绪');
  }

  /**
   * 创建模拟客户端 (用于开发测试)
   */
  createMockClient(name, config) {
    return {
      name,
      config,
      submitOrder: async (order) => {
        console.log(`[OrderExecutor] ${name} 模拟下单: ${order.side} ${order.symbol} ${order.size} @ ${order.price}`);
        return {
          orderId: `mock-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
          status: 'filled',
          filledPrice: order.price,
          filledSize: order.size,
          timestamp: Date.now()
        };
      },
      cancelOrder: async (orderId) => {
        console.log(`[OrderExecutor] ${name} 模拟取消订单: ${orderId}`);
        return { success: true };
      },
      getPositions: async () => {
        // 返回模拟持仓
        return Array.from(this.positions.values()).map(pos => ({
          symbol: pos.symbol,
          side: pos.side,
          size: pos.size,
          price: pos.price,
          pnl: 0
        }));
      }
    };
  }

  /**
   * 执行订单
   */
  async execute(order) {
    if (!this.initialized) {
      throw new Error('订单执行器未初始化');
    }
    
    this.stats.ordersSubmitted++;
    
    try {
      // 选择交易所 (简单策略: OKX优先)
      const client = this.clients.get('okx') || this.clients.values().next().value;
      if (!client) {
        throw new Error('没有可用的交易所客户端');
      }
      
      // 提交订单
      const result = await client.submitOrder(order);
      
      // 记录订单
      const orderRecord = {
        ...order,
        orderId: result.orderId,
        status: result.status,
        filledPrice: result.filledPrice,
        filledSize: result.filledSize,
        submittedAt: order.timestamp,
        filledAt: result.timestamp,
        exchange: client.name
      };
      this.orders.set(result.orderId, orderRecord);
      
      // 更新持仓
      if (result.status === 'filled') {
        this.updatePosition(orderRecord);
        this.stats.ordersFilled++;
      }
      
      console.log(`[OrderExecutor] 订单执行成功: ${order.symbol} ${order.side} ${order.filledSize} @ ${order.filledPrice}`);
      
      return {
        success: true,
        order: orderRecord
      };
      
    } catch (error) {
      this.stats.errors++;
      console.error('[OrderExecutor] 订单执行失败:', error.message);
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * 更新持仓
   */
  updatePosition(order) {
    const key = `${order.symbol}:${order.side}`;
    const existing = this.positions.get(key);
    
    if (existing) {
      // 增加现有持仓
      const totalSize = existing.size + order.filledSize;
      const avgPrice = (existing.price * existing.size + order.filledPrice * order.filledSize) / totalSize;
      existing.size = totalSize;
      existing.price = avgPrice;
      this.positions.set(key, existing);
    } else {
      // 新建持仓
      this.positions.set(key, {
        symbol: order.symbol,
        side: order.side,
        size: order.filledSize,
        price: order.filledPrice,
        entryTime: order.filledAt
      });
    }
    
    this.stats.activeOrders = this.positions.size;
  }

  /**
   * 获取当前持仓
   */
  async getPositions() {
    return Array.from(this.positions.values());
  }

  /**
   * 调整持仓 (止损止盈触发)
   */
  async adjustPosition(adjustment) {
    // 查找对应持仓并平仓
    const key = `${adjustment.symbol}:${adjustment.action === 'sell' ? 'buy' : 'sell'}`;
    const position = this.positions.get(key);
    
    if (position) {
      // 创建平仓订单
      const closeOrder = {
        symbol: adjustment.symbol,
        side: adjustment.action,
        price: 0, // 市价单
        size: position.size,
        reason: adjustment.reason,
        timestamp: Date.now()
      };
      
      const result = await this.execute(closeOrder);
      if (result.success) {
        this.positions.delete(key);
        this.stats.ordersCancelled++;
      }
      
      return result;
    }
    
    return { success: false, error: '持仓不存在' };
  }

  /**
   * 获取统计信息
   */
  getStats() {
    return {
      ordersSubmitted: this.stats.ordersSubmitted,
      ordersFilled: this.stats.ordersFilled,
      ordersCancelled: this.stats.ordersCancelled,
      activeOrders: this.stats.activeOrders,
      errors: this.stats.errors,
      positions: this.positions.size
    };
  }

  /**
   * 获取状态 (供V7.2 getStatus调用)
   */
  getStatus() {
    return {
      name: 'order-executor',
      running: this.initialized,
      version: '1.0.0',
      stats: {
        ordersSubmitted: this.stats.ordersSubmitted,
        ordersFilled: this.stats.ordersFilled,
        fillRate: this.stats.ordersSubmitted > 0 ? (this.stats.ordersFilled / this.stats.ordersSubmitted) : 0,
        activePositions: this.stats.activeOrders,
        errors: this.stats.errors
      },
      exchanges: Array.from(this.clients.keys())
    };
  }

  /**
   * 关闭执行器
   */
  async shutdown() {
    console.log('[OrderExecutor] 正在关闭...');
    
    // 取消所有活跃订单
    for (const [orderId, order] of this.orders) {
      if (order.status === 'pending' || order.status === 'partial') {
        const client = this.clients.get(order.exchange);
        if (client) {
          await client.cancelOrder(orderId);
        }
      }
    }
    
    this.initialized = false;
    console.log('[OrderExecutor] ✅ 已关闭');
  }
}

module.exports = OrderExecutor;
