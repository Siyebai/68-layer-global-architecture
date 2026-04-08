/**
 * order-executor.js — 订单执行智能体 PORT 19968
 * 职责: 接收decision:risk_approval → 实盘/dryRun下单 → 发布 execution:order
 * 默认dryRun=true (需显式切换为false才实盘)
 */
'use strict';
const http  = require('http');
const fs    = require('fs');
const path  = require('path');
const https = require('https');

const DRY_RUN = true;  // ⚠️ 实盘前必须将此设为false
const BUS = 'http://127.0.0.1:19958';
const LOGS_DIR = path.join(__dirname, '../logs');
if (!fs.existsSync(LOGS_DIR)) fs.mkdirSync(LOGS_DIR, {recursive:true});

const env = {};
try { fs.readFileSync(path.join(__dirname,'../../.env'),'utf8').split('\n').forEach(l=>{const m=l.match(/^(\w[^=]*)=(.+)$/);if(m)env[m[1].trim()]=m[2].trim();}); } catch(e){}

const publish = (event, payload) => {
  const body = JSON.stringify({ event, payload, source:'order-executor' });
  const opts = { method:'POST', headers:{'Content-Type':'application/json','Content-Length':Buffer.byteLength(body)} };
  const req = http.request(BUS+'/publish', opts, ()=>{});
  req.on('error', ()=>{}); req.write(body); req.end();
};

class OrderExecutor {
  constructor() {
    this.port  = 19968;
    this.dryRun = DRY_RUN;
    this.orders = [];
    this.simOrders = [];
  }

  async executeOrder(approval) {
    const { symbol, notionalUSDT, stopLoss, takeProfit } = approval;
    const size = parseFloat(notionalUSDT);

    if (this.dryRun) {
      // 模拟成交
      const sim = {
        mode: 'dryRun', symbol,
        side: 'long',
        size: size.toFixed(2),
        simPrice: '(市价)', stopLoss, takeProfit,
        fee: (size * 0.0005).toFixed(4)+'U',
        orderId: 'SIM-'+Date.now(),
        ts: Date.now()
      };
      this.simOrders.push(sim);
      if (this.simOrders.length > 500) this.simOrders.shift();

      // 写入日志
      fs.appendFileSync(path.join(LOGS_DIR,'trades.jsonl'), JSON.stringify(sim)+'\n');

      publish('execution:order', { ...sim, dryRun:true });
      console.log(`[OrderExecutor] 📊 DryRun: ${symbol} long ${size}U @ 市价 SL:${stopLoss} TP:${takeProfit}`);
      return sim;
    }

    // ── 实盘执行 (dryRun=false 时启用) ──
    try {
      const ccxt = require('ccxt');
      const gate = new ccxt.gate({
        apiKey: env.GATE_API_KEY, secret: env.GATE_API_SECRET,
        options:{ defaultType:'swap' }
      });
      const sym = `${symbol}/USDT:USDT`;
      const ticker = await gate.fetchTicker(sym);
      const price  = ticker.last;
      const qty    = Math.floor(size / price * 100) / 100;

      const order = await gate.createOrder(sym, 'market', 'buy', qty);
      const result = {
        mode: 'live', symbol, side:'long',
        size: qty, filledPrice: order.average || price,
        fee: (size * 0.0005).toFixed(4)+'U',
        orderId: order.id, ts: Date.now()
      };
      this.orders.push(result);
      fs.appendFileSync(path.join(LOGS_DIR,'trades.jsonl'), JSON.stringify(result)+'\n');
      publish('execution:order', result);
      console.log(`[OrderExecutor] 🔴 LIVE: ${symbol} orderId ${order.id} @ ${price}`);
      return result;
    } catch(e) {
      const err = { error: e.message, symbol, ts: Date.now() };
      publish('alert:order_failed', err);
      return err;
    }
  }

  // 轮询 RiskController approvals
  pollApprovals() {
    const seen = new Set();
    setInterval(() => {
      http.get('http://127.0.0.1:19967/approvals', res => {
        let d=''; res.on('data',c=>d+=c);
        res.on('end',()=>{
          try {
            const approvals = JSON.parse(d);
            for (const a of approvals) {
              if (a.approved && !seen.has(a.ts) && Date.now()-a.ts < 60000) {
                seen.add(a.ts);
                this.executeOrder(a);
              }
            }
          } catch(e){}
        });
      }).on('error',()=>{});
    }, 10000);
  }

  start() {
    http.createServer((req, res) => {
      res.setHeader('Content-Type','application/json');
      if (req.url==='/health') {
        res.writeHead(200);
        res.end(JSON.stringify({ ok:true, dryRun:this.dryRun, simOrders:this.simOrders.length, liveOrders:this.orders.length, ts:Date.now() }));
      } else if (req.url==='/orders') {
        res.writeHead(200);
        res.end(JSON.stringify([...this.simOrders, ...this.orders].slice(-30)));
      } else { res.writeHead(404); res.end('{}'); }
    }).listen(this.port, () => console.log(`[OrderExecutor] PORT ${this.port} | dryRun=${this.dryRun} ✅`));
    this.pollApprovals();
  }
}

new OrderExecutor().start();
