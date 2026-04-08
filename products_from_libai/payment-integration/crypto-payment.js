/**
 * 加密货币支付处理器
 * 支持 BTC, ETH, USDT 等
 */

const axios = require('axios');

class CryptoPaymentProcessor {
  constructor(config = {}) {
    this.wallets = config.wallets || {};
    this.callbackUrl = config.callbackUrl || 'http://localhost:3000/webhooks/payment';
  }

  /**
   * 生成支付地址
   */
  async createPayment(amount, currency, userId, orderId) {
    const wallet = this.wallets[currency];
    if (!wallet) {
      throw new Error(`不支持的加密货币: ${currency}`);
    }

    const payment = {
      id: `pay_${Date.now()}`,
      userId,
      orderId,
      currency,
      amount,
      address: wallet.address,
      qrCode: wallet.qrCode, // base64 图片
      status: 'pending',
      expiresAt: Date.now() + 15 * 60 * 1000, // 15分钟过期
      confirmationsRequired: 2,
    };

    // 存储到 Redis (模拟)
    await this._storePayment(payment);

    return payment;
  }

  /**
   * 验证支付
   */
  async verifyPayment(paymentId, txHash) {
    // 这里应该查询区块链确认交易
    // 简化实现：返回已确认
    return {
      paymentId,
      txHash,
      status: 'confirmed',
      confirmedAt: Date.now(),
      confirmations: 2,
    };
  }

  async _storePayment(payment) {
    // 实际应该存数据库或Redis
    console.log(`[CryptoPayment] 创建支付: ${payment.id}`);
  }

  getSupportedCurrencies() {
    return Object.keys(this.wallets);
  }
}

module.exports = CryptoPaymentProcessor;
