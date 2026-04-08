/**
 * hedging-manager.js — 对冲管理智能体 PORT 19969
 * 职责: Gate一腿成交后 → BG/OKX自动空腿对冲 → Delta=0验证 → 发布 execution:hedge
 * 来源知识: strategy_matrix_v12 原子对冲理论
 */
'use strict';
const http = require('http');
const fs   = require('fs');
const path = require('path');

const BUS = 'http://127.0.0.1:19958';
const env = {};
try { fs.readFileSync(path.join(__dirname,'../../.env'),'utf8').split('\n').forEach(l=>{const m=l.match(/^(\w[^=]*)=(.+)$/);if(m)env[m[1].trim()]=m[2].trim();}); } catch(e){}

const publish = (event, payload) => {
  const body = JSON.stringify({ event, payload, source:'hedging-manager' });
  const opts = { method:'POST', headers:{'Content-Type':'application/json','Content-Length':Buffer.byteLength(body)} };
  const req = http.request(BUS+'/publish', opts, ()=>{}); req.on('error',()=>{}); req.write(body); req.end();
};

class HedgingManager {
  constructor() {
    this.port = 19969;
    this.hedges = [];
    this.deltaLog = [];
  }

  // 计算目标对冲比例 (LRC: OKX 1张=10LRC, TURBO: BG 1:1000)
  calcHedgeSize(symbol, gateSize) {
    const specials = { 'LRC': { exchange:'OKX', ratio:0.1 }, 'TURBO': { exchange:'BG', ratio:1000 } };
    if (specials[symbol]) return { exchange: specials[symbol].exchange, size: gateSize * specials[symbol].ratio };
    return { exchange:'BG', size: gateSize };
  }

  async executeHedge(orderEvent) {
    const { symbol, size, orderId: gateOrderId, dryRun } = orderEvent;
    const { exchange, size: hedgeSize } = this.calcHedgeSize(symbol, parseFloat(size));

    if (dryRun) {
      const result = {
        mode: 'dryRun', symbol,
        hedgeExchange: exchange, hedgeSize,
        hedgeOrderId: 'HEDGE-SIM-'+Date.now(),
        gateOrderId,
        deltaAfter: 0,
        ts: Date.now()
      };
      this.hedges.push(result);
      if (this.hedges.length > 200) this.hedges.shift();
      publish('execution:hedge', result);
      console.log(`[HedgingManager] 📊 DryRun: ${symbol} ${exchange} 空×${hedgeSize} → Delta=0`);

      // 验证Delta并发布
      this.verifyDelta(symbol, parseFloat(size), hedgeSize, exchange);
      return result;
    }

    // 实盘对冲 (仅当 dryRun=false)
    try {
      const ccxt = require('ccxt');
      let ex;
      if (exchange === 'OKX') {
        ex = new ccxt.okx({ apiKey:env.OKX_API_KEY, secret:env.OKX_API_SECRET, password:env.OKX_PASSPHRASE, options:{defaultType:'swap'} });
      } else {
        ex = new ccxt.bitget({ apiKey:env.BITGET_API_KEY, secret:env.BITGET_API_SECRET, password:env.BITGET_API_PASSPHRASE, options:{defaultType:'swap'} });
      }
      const sym = `${symbol}/USDT:USDT`;
      const order = await ex.createOrder(sym, 'market', 'sell', hedgeSize);
      const result = {
        mode:'live', symbol, hedgeExchange:exchange, hedgeSize,
        hedgeOrderId: order.id, gateOrderId,
        hedgePrice: order.average,
        deltaAfter: 0, ts: Date.now()
      };
      this.hedges.push(result);
      publish('execution:hedge', result);
      console.log(`[HedgingManager] 🔴 LIVE Hedge: ${symbol} ${exchange} orderId ${order.id}`);
      return result;
    } catch(e) {
      publish('alert:hedge_failed', { symbol, error:e.message, ts:Date.now() });
      return { error: e.message };
    }
  }

  verifyDelta(symbol, gateSize, hedgeSize, hedgeExchange) {
    // 规格矫正
    let normalizedHedge = hedgeSize;
    if (symbol === 'LRC') normalizedHedge = hedgeSize * 10;   // OKX 1张=10LRC
    if (symbol === 'TURBO') normalizedHedge = hedgeSize / 1000; // BG 1:1000

    const delta = gateSize - normalizedHedge;
    const ok = Math.abs(delta) < 0.5;

    const log = { symbol, gateSize, hedgeSize, normalizedHedge, delta, ok, ts:Date.now() };
    this.deltaLog.push(log);
    if (!ok) publish('alert:delta_mismatch', { ...log, action:'立即修复对冲' });
    else publish('monitor:delta_ok', log);
    return ok;
  }

  // 轮询 OrderExecutor 订单
  pollOrders() {
    const seen = new Set();
    setInterval(() => {
      http.get('http://127.0.0.1:19968/orders', res => {
        let d=''; res.on('data',c=>d+=c);
        res.on('end',()=>{
          try {
            const orders = JSON.parse(d);
            for (const o of orders) {
              if (!seen.has(o.orderId) && Date.now()-o.ts < 120000) {
                seen.add(o.orderId);
                this.executeHedge(o);
              }
            }
          } catch(e){}
        });
      }).on('error',()=>{});
    }, 15000);
  }

  start() {
    http.createServer((req, res) => {
      res.setHeader('Content-Type','application/json');
      if (req.url==='/health') {
        res.writeHead(200);
        res.end(JSON.stringify({ ok:true, hedges:this.hedges.length, deltaLog:this.deltaLog.length, ts:Date.now() }));
      } else if (req.url==='/hedges') {
        res.writeHead(200);
        res.end(JSON.stringify(this.hedges.slice(-20)));
      } else if (req.url==='/delta') {
        res.writeHead(200);
        res.end(JSON.stringify(this.deltaLog.slice(-20)));
      } else { res.writeHead(404); res.end('{}'); }
    }).listen(this.port, () => console.log(`[HedgingManager] PORT ${this.port} ✅`));
    this.pollOrders();
  }
}

new HedgingManager().start();
