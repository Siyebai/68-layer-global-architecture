/**
 * market-data-collector.js — 市场数据采集智能体
 * PORT 19961 | 订阅市场数据，定期发布事件到event-bus
 * 2026-03-29
 */
'use strict';
const http = require('http');
const { KlineFetcher } = require('../data/kline-fetcher');
const { MarketDepth } = require('../data/market-depth');

const fetcher = new MarketDepth();
const klFetcher = new KlineFetcher();
const SYMBOLS = ['LRC','0G','TURBO','FET','SAND','APT'];

class MarketDataCollector {
  constructor() {
    this.port = 19961;
    this.latestData = {};
    this.eventBuffer = [];
  }

  async collectSnapshot(sym) {
    try {
      const [klines1h, snap] = await Promise.all([
        klFetcher.fetchOHLCV(sym,'1h',60),
        fetcher.snapshot(sym)
      ]);
      
      return {
        symbol: sym,
        kline: {
          timestamp: Date.now(),
          closes: klFetcher.closes(klines1h),
          highs: klFetcher.highs(klines1h),
          lows: klFetcher.lows(klines1h),
          volumes: klFetcher.volumes(klines1h),
          lastClose: klFetcher.closes(klines1h)[klFetcher.closes(klines1h).length-1]
        },
        spot: snap.spot,
        oi: snap.oi,
        basis: snap.basis
      };
    } catch(e) { return null; }
  }

  publishEvent(type, payload) {
    const evt = { type, payload, ts: Date.now() };
    this.eventBuffer.push(evt);
    // 发布到event-bus
    fetch('http://127.0.0.1:19958/publish', {
      method: 'POST',
      body: JSON.stringify({
        event: type,
        payload,
        source: 'market-data-collector'
      })
    }).catch(()=>{});
    return evt;
  }

  async start() {
    console.log('[MarketDataCollector] 启动中...');
    
    // 启动HTTP服务
    http.createServer((req, res) => {
      res.setHeader('Content-Type', 'application/json');
      if (req.url === '/health') {
        res.writeHead(200);
        res.end(JSON.stringify({
          ok: true, 
          symbols: SYMBOLS.length,
          buffer: this.eventBuffer.length,
          ts: Date.now()
        }));
      } else if (req.url === '/latest') {
        res.writeHead(200);
        res.end(JSON.stringify(this.latestData));
      } else {
        res.writeHead(404);
        res.end('{}');
      }
    }).listen(this.port, () => {
      console.log(`[MarketDataCollector] PORT ${this.port} ✅`);
    });

    // 每2分钟采集一次
    setInterval(async () => {
      for (const sym of SYMBOLS) {
        const data = await this.collectSnapshot(sym);
        if (data) {
          this.latestData[sym] = data;
          this.publishEvent('market:kline', {
            symbol: sym,
            data: data.kline
          });
        }
        await new Promise(r => setTimeout(r, 300));
      }
    }, 120000);
  }
}

new MarketDataCollector().start();
