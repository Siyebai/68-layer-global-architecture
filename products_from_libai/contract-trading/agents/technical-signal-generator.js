/**
 * technical-signal-generator.js — 技术信号生成智能体
 * PORT 19964 | 订阅市场数据，生成技术面信号
 * 2026-03-29
 */
'use strict';
const http = require('http');
const { Indicators } = require('../indicators/indicators');
const { AdvancedIndicators } = require('../indicators/advanced-indicators');

class TechnicalSignalGenerator {
  constructor() {
    this.port = 19964;
    this.signals = new Map();
    this.eventBuffer = [];
    this.lastKlineData = {};
  }

  publishEvent(type, payload) {
    const evt = { type, payload, ts: Date.now() };
    this.eventBuffer.push(evt);
    fetch('http://127.0.0.1:19958/publish', {
      method: 'POST',
      body: JSON.stringify({
        event: type,
        payload,
        source: 'technical-signal-generator'
      })
    }).catch(()=>{});
    return evt;
  }

  subscribeToEventBus() {
    const es = new (require('events').EventEmitter)();
    
    // 订阅market:kline事件
    const sseUrl = 'http://127.0.0.1:19958/subscribe?events=market:kline';
    const https = require('https');
    const http2 = require('http');
    
    console.log('[TechnicalSignalGenerator] 订阅市场数据...');
  }

  async generateSignal(symbol, klineData) {
    if (!klineData || !klineData.closes) return null;
    
    const closes = klineData.closes;
    const highs = klineData.highs;
    const lows = klineData.lows;

    // 组装为标准K线格式
    const klines = closes.map((c, i) => ({
      c: c, h: highs[i], l: lows[i]
    }));

    // 生成信号
    const basicSig = Indicators.signal(closes, highs, lows);
    const advSig = AdvancedIndicators.contractSignal(klines);

    const signal = {
      symbol,
      direction: basicSig.direction,
      strength1h: basicSig.strength,
      bullSignals: basicSig.bullSignals,
      bearSignals: basicSig.bearSignals,
      rsi: parseFloat(basicSig.indicators.rsi || 0),
      macd: parseFloat(basicSig.indicators.macdHist || 0),
      bbPct: parseFloat(basicSig.indicators.bbPct || 0),
      zscore: parseFloat(advSig.zscore || 0),
      trend: advSig.trend,
      liquidityHunt: advSig.liquidityHunt,
      timestamp: Date.now(),
      grade: this.assignGrade(basicSig.strength, advSig.trend)
    };

    this.signals.set(symbol, signal);
    this.publishEvent('signal:technical', signal);
    return signal;
  }

  assignGrade(strength, trend) {
    if (trend.confidence >= 0.85 && strength >= 0.75) return 'A';
    if (strength >= 0.50) return 'B';
    if (strength >= 0.25) return 'C';
    return 'D';
  }

  async start() {
    console.log('[TechnicalSignalGenerator] 启动中...');

    http.createServer((req, res) => {
      res.setHeader('Content-Type', 'application/json');
      if (req.url === '/health') {
        res.writeHead(200);
        res.end(JSON.stringify({
          ok: true,
          signals: this.signals.size,
          buffer: this.eventBuffer.length,
          ts: Date.now()
        }));
      } else if (req.url === '/signals') {
        res.writeHead(200);
        res.end(JSON.stringify(Array.from(this.signals.values())));
      } else {
        res.writeHead(404);
        res.end('{}');
      }
    }).listen(this.port, () => {
      console.log(`[TechnicalSignalGenerator] PORT ${this.port} ✅`);
    });

    // 监听市场数据并生成信号
    setInterval(() => {
      // 通过poll市场数据采集器
      const http2 = require('http');
      http2.get('http://127.0.0.1:19961/latest', res => {
        let data = '';
        res.on('data', c => data += c);
        res.on('end', () => {
          try {
            const latest = JSON.parse(data);
            for (const [sym, d] of Object.entries(latest)) {
              if (d && d.kline) {
                this.generateSignal(sym, d.kline);
              }
            }
          } catch(e) {}
        });
      }).on('error', ()=>{});
    }, 180000); // 每3分钟生成一次
  }
}

new TechnicalSignalGenerator().start();
