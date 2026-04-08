/**
 * arbitrage-scanner.js — 套利机会扫描智能体 PORT 19965
 * 职责: 整合费率+技术信号+RR计算 → 筛选套利机会 → 发布 signal:arbitrage
 * 知识来源: trading-framework-v3.md + strategy_matrix_v12.md
 */
'use strict';
const http  = require('http');
const https = require('https');
const { AdvancedIndicators } = require('../indicators/advanced-indicators');

const BUS = 'http://127.0.0.1:19958';
const SYMBOLS = ['LRC','0G','TURBO','FET','SAND','APT','BTC','ETH','SOL','BNB'];
const THRESHOLDS = {
  minDailyRate: -0.003,  // 日收至少-0.3%
  minRR: 2.0,            // RR≥2
  maxBasisPct: 3.0,      // 基差<3%
};

const gFetch = (url) => new Promise((res,rej)=>{
  let d=''; https.get(url, r=>{r.on('data',c=>d+=c);r.on('end',()=>{try{res(JSON.parse(d));}catch(e){rej(e);}});}).on('error',rej);
});

const publish = (event, payload) => {
  const body = JSON.stringify({ event, payload, source:'arbitrage-scanner' });
  const opts = { method:'POST', headers:{'Content-Type':'application/json','Content-Length':Buffer.byteLength(body)} };
  const req = http.request(BUS+'/publish', opts, ()=>{}); req.on('error',()=>{}); req.write(body); req.end();
};

class ArbitrageScanner {
  constructor() {
    this.port = 19965;
    this.opportunities = [];
    this.scanCount = 0;
  }

  async scanSymbol(sym) {
    try {
      const contract = `${sym}_USDT`;
      const data = await gFetch(`https://api.gateio.ws/api/v4/futures/usdt/contracts/${contract}`);
      const spotData = await gFetch(`https://api.gateio.ws/api/v4/spot/tickers?currency_pair=${sym}_USDT`);

      const fundingRate = parseFloat(data.funding_rate || 0);
      const contractPrice = parseFloat(data.last_price || 0);
      const spotPrice = Array.isArray(spotData) && spotData[0] ? parseFloat(spotData[0].last) : contractPrice;

      // 基差检查
      const basisPct = Math.abs((contractPrice - spotPrice) / spotPrice * 100);

      // RR计算 (假设名义50U, 3次结算)
      const rr = AdvancedIndicators.calcArbitrageRR(fundingRate, 50, 3);

      // 日净收益估算 (3次8h结算/天 × 费率)
      const dailyNetRate = fundingRate * 3;

      const opportunity = {
        symbol: sym,
        fundingRate,
        dailyNetRate,
        dailyNetPct: (dailyNetRate * 100).toFixed(4)+'%',
        contractPrice, spotPrice,
        basisPct: basisPct.toFixed(3)+'%',
        riskRewardRatio: parseFloat(rr.riskRewardRatio),
        viable: rr.viable,
        passThreshold: fundingRate < THRESHOLDS.minDailyRate/3 && rr.viable && basisPct < THRESHOLDS.maxBasisPct,
        grade: this.gradeOpportunity(fundingRate, parseFloat(rr.riskRewardRatio), basisPct),
        ts: Date.now()
      };

      return opportunity;
    } catch(e) { return null; }
  }

  gradeOpportunity(rate, rr, basis) {
    if (rate < -0.005 && rr >= 3.0 && basis < 2) return 'A';
    if (rate < -0.003 && rr >= 2.0 && basis < 3) return 'B';
    if (rate < -0.001 && rr >= 1.5) return 'C';
    return 'D';
  }

  async fullScan() {
    this.scanCount++;
    const results = [];
    for (const sym of SYMBOLS) {
      const opp = await this.scanSymbol(sym);
      if (opp) results.push(opp);
      await new Promise(r => setTimeout(r, 200));
    }

    // 按日净收排序
    results.sort((a, b) => a.fundingRate - b.fundingRate);
    this.opportunities = results;

    // 发布最优机会
    const topOpps = results.filter(o => o.passThreshold);
    if (topOpps.length) {
      publish('signal:arbitrage', { opportunities: topOpps, scanId: this.scanCount, ts: Date.now() });
      console.log(`[ArbitrageScanner] 发现${topOpps.length}个套利机会:`, topOpps.map(o=>`${o.symbol}(${o.grade}:${o.dailyNetPct})`).join(', '));
    }

    console.log(`[ArbitrageScanner] 扫描#${this.scanCount}完成: ${results.length}个品种`);
    return results;
  }

  start() {
    http.createServer((req, res) => {
      res.setHeader('Content-Type','application/json');
      if (req.url==='/health') {
        res.writeHead(200);
        res.end(JSON.stringify({ ok:true, scanCount:this.scanCount, opportunities:this.opportunities.length, ts:Date.now() }));
      } else if (req.url==='/opportunities') {
        res.writeHead(200);
        res.end(JSON.stringify(this.opportunities));
      } else if (req.url==='/top') {
        res.writeHead(200);
        const top = this.opportunities.filter(o=>o.passThreshold).slice(0,5);
        res.end(JSON.stringify(top));
      } else { res.writeHead(404); res.end('{}'); }
    }).listen(this.port, () => console.log(`[ArbitrageScanner] PORT ${this.port} ✅`));

    // 立即扫描，之后每15分钟
    this.fullScan();
    setInterval(() => this.fullScan(), 15 * 60 * 1000);
  }
}

new ArbitrageScanner().start();
