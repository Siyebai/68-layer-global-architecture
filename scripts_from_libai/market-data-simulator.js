#!/usr/bin/env node
/**
 * 市场数据模拟器 - 激活 V26.0 三引擎
 * 每5秒生成 BTC/ETH/SOL 价格数据并注入 market_data stream
 */

require('dotenv').config();
const Redis = require('ioredis');
const redis = new Redis(process.env.REDIS_URL || 'redis://127.0.0.1:6379');

const symbols = ['BTC-USDT', 'ETH-USDT', 'SOL-USDT', 'EOS-USDT'];

// 初始价格基准
const basePrices = {
  'BTC-USDT': 85000,
  'ETH-USDT': 1800,
  'SOL-USDT': 150,
  'EOS-USDT': 0.8
};

console.log('🚀 市场数据模拟器启动...');

async function injectMarketData() {
  while (true) {
    try {
      for (const symbol of symbols) {
        const base = basePrices[symbol];
        const change = (Math.random() - 0.5) * 0.002; // ±0.2% 波动
        const price = base * (1 + change);

        const ticker = {
          symbol,
          type: 'ticker',
          price: parseFloat(price.toFixed(2)),
          bid: parseFloat((price * 0.9998).toFixed(2)),
          ask: parseFloat((price * 1.0002).toFixed(2)),
          volume: Math.floor(1000000 + Math.random() * 500000),
          timestamp: Date.now()
        };

        // 注入 market_data stream
        await redis.xadd('market-data', '*', 'data', JSON.stringify(ticker));
      }

      console.log(`[模拟器] 注入 ${symbols.length} 条市场数据`);
      await new Promise(resolve => setTimeout(resolve, 5000)); // 5秒间隔
    } catch (err) {
      console.error('模拟器错误:', err.message);
      await new Promise(resolve => setTimeout(resolve, 5000));
    }
  }
}

injectMarketData().catch(console.error);
