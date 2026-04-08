/**
 * risk-controller.js — 风控审核智能体 PORT 19967
 * 职责: 接收decision:analysis → 凯利准则+仓位计算+基差审核 → 发布 decision:risk_approval
 */
'use strict';
const http = require('http');
const https = require('https');

const BUS = 'http://127.0.0.1:19958';
const EQUITY_FALLBACK = 250;  // U

const publish = (event, payload, source) => {
  const body = JSON.stringify({ event, payload, source });
  const opts = { method:'POST', headers:{'Content-Type':'application/json','Content-Length':Buffer.byteLength(body)} };
  const req = http.request(BUS+'/publish', opts, ()=>{});
  req.on('error', ()=>{});
  req.write(body); req.end();
};

class RiskController {
  constructor() {
    this.port = 19967;
    this.dailyPnl = 0;
    this.dailyReset = new Date().setHours(0,0,0,0);
    this.approvals = [];
  }

  checkDayReset() {
    const today = new Date().setHours(0,0,0,0);
    if (today > this.dailyReset) { this.dailyPnl = 0; this.dailyReset = today; }
  }

  // 核心风控检查
  assess(analysis, equity = EQUITY_FALLBACK) {
    this.checkDayReset();
    const errors = [];

    // 1. 日亏限额
    if (this.dailyPnl <= -5) errors.push('日亏>5U已触达，今日停止');

    // 2. 信心度门槛 (>=65才审批)
    if (analysis.confidence < 65) errors.push(`信心度${analysis.confidence.toFixed(0)}% < 65%`);

    // 3. 基差检查
    if (analysis.basis && Math.abs(parseFloat(analysis.basis)) > 3) errors.push('基差>3%，劈腿风险');

    // 4. 期望RR检查
    if (analysis.expectedRR < 2.0) errors.push(`RR=${analysis.expectedRR.toFixed(2)} < 2.0`);

    // 5. 凯利准则计算仓位
    const riskPerTrade = equity * 0.01;           // 单笔最大亏损1%总资金
    const stopLossPct  = 0.02;                    // 2%止损
    const notional     = riskPerTrade / stopLossPct;
    const cappedNom    = Math.min(notional, equity * 0.06);  // 上限6%总权益

    const stopLossPrice  = (analysis.lastPrice || 0) * (1 - stopLossPct);
    const takeProfitPrice = (analysis.lastPrice || 0) * (1 + stopLossPct * 1.5);

    const ok = errors.length === 0;
    const result = {
      approved: ok,
      symbol: analysis.symbol,
      confidence: analysis.confidence,
      notionalUSDT: cappedNom.toFixed(2),
      stopLoss: stopLossPrice.toFixed(5),
      takeProfit: takeProfitPrice.toFixed(5),
      riskPerTrade: riskPerTrade.toFixed(2)+'U',
      errors,
      ts: Date.now()
    };

    this.approvals.push(result);
    if (this.approvals.length > 200) this.approvals.shift();

    const evt = ok ? 'decision:risk_approval' : 'decision:risk_rejected';
    publish(evt, result, 'risk-controller');
    return result;
  }

  // 实时从 MultiDimensionAnalyzer 轮询
  pollAnalyses() {
    setInterval(() => {
      http.get('http://127.0.0.1:19966/analyses', res => {
        let d = ''; res.on('data', c=>d+=c);
        res.on('end', () => {
          try {
            const analyses = JSON.parse(d);
            for (const a of analyses) {
              // 仅处理30秒内的新分析
              if (Date.now()-a.timestamp < 30000) this.assess(a);
            }
          } catch(e){}
        });
      }).on('error',()=>{});
    }, 30000);
  }

  start() {
    http.createServer((req, res) => {
      res.setHeader('Content-Type','application/json');
      if (req.url === '/health') {
        res.writeHead(200);
        res.end(JSON.stringify({ ok:true, port:this.port, dailyPnl:this.dailyPnl, approvals:this.approvals.length, ts:Date.now() }));
      } else if (req.url === '/approvals') {
        res.writeHead(200);
        res.end(JSON.stringify(this.approvals.slice(-20)));
      } else if (req.url.startsWith('/assess')) {
        // 手动触发评估
        const sym = new URL('http://x'+req.url).searchParams.get('sym')||'BTC';
        const mockAnalysis = { symbol:sym, confidence:75, expectedRR:2.5, lastPrice:0.02160 };
        res.writeHead(200);
        res.end(JSON.stringify(this.assess(mockAnalysis)));
      } else { res.writeHead(404); res.end('{}'); }
    }).listen(this.port, () => console.log(`[RiskController] PORT ${this.port} ✅`));
    this.pollAnalyses();
  }
}

new RiskController().start();
