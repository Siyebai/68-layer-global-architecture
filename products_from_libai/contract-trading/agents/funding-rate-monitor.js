/**
 * funding-rate-monitor.js — 费率监控智能体 PORT 19962
 * 职责: 定期扫描6个品种费率 → 检测反转/极值 → 发布告警到event-bus
 */
'use strict';
const http  = require('http');
const https = require('https');

const BUS     = 'http://127.0.0.1:19958';
const SYMBOLS = ['LRC','0G','TURBO','FET','SAND','APT'];
const GATE_URL = 'https://api.gateio.ws/api/v4/futures/usdt/contracts';

const gFetch = (url) => new Promise((res,rej)=>{
  let d=''; https.get(url, r=>{r.on('data',c=>d+=c);r.on('end',()=>{try{res(JSON.parse(d));}catch(e){rej(e);}});}).on('error',rej);
});

const publish = (event, payload) => {
  const body = JSON.stringify({ event, payload, source:'funding-rate-monitor' });
  const opts = { method:'POST', headers:{'Content-Type':'application/json','Content-Length':Buffer.byteLength(body)} };
  const req = http.request(BUS+'/publish', opts, ()=>{}); req.on('error',()=>{}); req.write(body); req.end();
};

class FundingRateMonitor {
  constructor() {
    this.port = 19962;
    this.rateHistory = {};  // sym → [{rate, ts}]
    this.latest = {};
    SYMBOLS.forEach(s => { this.rateHistory[s] = []; });
  }

  async fetchRate(sym) {
    const contract = `${sym}_USDT`;
    try {
      const data = await gFetch(`${GATE_URL}/${contract}`);
      return {
        symbol: sym,
        rate: parseFloat(data.funding_rate || 0),
        markPrice: parseFloat(data.mark_price || 0),
        lastPrice: parseFloat(data.last_price || 0),
        nextApply: data.funding_next_apply,
        ts: Date.now()
      };
    } catch(e) { return null; }
  }

  analyze(sym, current, previous) {
    const rate = current.rate;
    const prevRate = previous?.rate || rate;
    const alerts = [];

    // 1. 费率反转: 负→正
    if (prevRate < -0.001 && rate >= -0.001) {
      alerts.push({ type:'funding_flip', severity:'HIGH', action:'减仓50%', rate, prevRate });
      publish('alert:funding_flip', { symbol:sym, from:prevRate, to:rate, action:'立即减仓50%' });
    }

    // 2. 极值: <-0.5%/8h → 极值套利机会
    if (rate < -0.005) {
      alerts.push({ type:'funding_extreme', severity:'HIGH', action:'极值套利机会', rate });
      publish('alert:funding_extreme', { symbol:sym, rate, action:'费率极值，建仓窗口打开' });
    }

    // 3. 门槛预警: rate > -0.001 持续
    if (rate > -0.001) {
      alerts.push({ type:'rate_too_low', severity:'LOW', action:'日收<0.4%，可考虑轮换', rate });
    }

    return alerts;
  }

  async scan() {
    for (const sym of SYMBOLS) {
      const current = await this.fetchRate(sym);
      if (!current) continue;

      const hist = this.rateHistory[sym];
      const previous = hist[hist.length-1];
      hist.push(current);
      if (hist.length > 48) hist.shift();  // 保留48条(约16天)

      this.latest[sym] = current;
      const alerts = this.analyze(sym, current, previous);

      // 发布正常费率事件
      publish('market:funding', { symbol:sym, rate:current.rate, alerts, ts:current.ts });

      await new Promise(r => setTimeout(r, 200));
    }
    console.log(`[FundingRateMonitor] 扫描完成 ${new Date().toISOString()}`);
  }

  start() {
    http.createServer((req, res) => {
      res.setHeader('Content-Type','application/json');
      if (req.url==='/health') {
        res.writeHead(200);
        res.end(JSON.stringify({ ok:true, symbols:SYMBOLS.length, ts:Date.now() }));
      } else if (req.url==='/rates') {
        res.writeHead(200);
        res.end(JSON.stringify(this.latest));
      } else if (req.url==='/history') {
        res.writeHead(200);
        res.end(JSON.stringify(this.rateHistory));
      } else { res.writeHead(404); res.end('{}'); }
    }).listen(this.port, () => console.log(`[FundingRateMonitor] PORT ${this.port} ✅`));

    // 立即扫描一次，之后每30分钟
    this.scan();
    setInterval(() => this.scan(), 30 * 60 * 1000);
  }
}

new FundingRateMonitor().start();
