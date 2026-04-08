/**
 * system-coordinator.js — 系统总协调智能体 PORT 19963
 * 职责: 整合所有智能体输出 → 统一决策日志 → Telegram推送重要事件
 *       实现所有智能体的"黏合剂"
 */
'use strict';
const http = require('http');
const https = require('https');

const BUS     = 'http://127.0.0.1:19958';
const AGENTS  = [
  { name:'MarketDataCollector',      port:19961 },
  { name:'FundingRateMonitor',       port:19962 },
  { name:'ArbitrageScanner',         port:19965 },
  { name:'TechnicalSignalGenerator', port:19964 },
  { name:'MultiDimensionAnalyzer',   port:19966 },
  { name:'RiskController',           port:19967 },
  { name:'OrderExecutor',            port:19968 },
  { name:'HedgingManager',           port:19969 },
  { name:'PositionMonitor',          port:19960 },
  { name:'ScanDaemon',               port:19999 },
  { name:'RiskGuardian',             port:19993 },
];

const httpGet = (url) => new Promise((res,rej)=>{
  let d=''; http.get(url, r=>{r.on('data',c=>d+=c);r.on('end',()=>{try{res(JSON.parse(d));}catch(e){res(null);}});}).on('error',()=>res(null));
});

class SystemCoordinator {
  constructor() {
    this.port = 19963;
    this.agentStatus = {};
    this.eventLog = [];
    this.alertQueue = [];
    this.decisionLog = [];
  }

  async healthCheck() {
    const results = {};
    for (const agent of AGENTS) {
      const data = await httpGet(`http://127.0.0.1:${agent.port}/health`);
      results[agent.name] = { port: agent.port, up: !!data, ts: Date.now() };
    }
    this.agentStatus = results;

    const upCount  = Object.values(results).filter(v=>v.up).length;
    const downList = Object.entries(results).filter(([,v])=>!v.up).map(([k])=>k);

    if (downList.length > 0) {
      this.alert('MEDIUM', `${downList.length}个智能体Down: ${downList.join(', ')}`, 'health_check');
    }

    return { upCount, total: AGENTS.length, downList };
  }

  alert(severity, message, source) {
    const evt = { severity, message, source, ts: Date.now() };
    this.alertQueue.push(evt);
    if (this.alertQueue.length > 100) this.alertQueue.shift();
    console.log(`[Coordinator] ${severity === 'HIGH' ? '🔴' : '🟡'} ${message}`);
    // 高优先级告警通过event-bus广播
    if (severity === 'HIGH') {
      const body = JSON.stringify({ event:'alert:critical', payload:evt, source:'system-coordinator' });
      const opts = { method:'POST', headers:{'Content-Type':'application/json','Content-Length':Buffer.byteLength(body)} };
      const req = http.request(BUS+'/publish', opts, ()=>{}); req.on('error',()=>{}); req.write(body); req.end();
    }
  }

  async aggregateSummary() {
    // 聚合所有智能体最新状态
    const [health, rates, opportunities, signals, analyses] = await Promise.all([
      this.healthCheck(),
      httpGet('http://127.0.0.1:19962/rates'),
      httpGet('http://127.0.0.1:19965/top'),
      httpGet('http://127.0.0.1:19964/signals'),
      httpGet('http://127.0.0.1:19966/analyses'),
    ]);

    const summary = {
      health,
      fundingRates: rates || {},
      topOpportunities: opportunities || [],
      signals: signals || [],
      analyses: analyses || [],
      ts: Date.now()
    };

    this.decisionLog.push(summary);
    if (this.decisionLog.length > 50) this.decisionLog.shift();
    return summary;
  }

  start() {
    http.createServer(async (req, res) => {
      res.setHeader('Content-Type','application/json');
      try {
        if (req.url==='/health') {
          res.writeHead(200);
          res.end(JSON.stringify({ ok:true, agents:AGENTS.length, alerts:this.alertQueue.length, ts:Date.now() }));
        } else if (req.url==='/status') {
          const s = await this.healthCheck();
          res.writeHead(200);
          res.end(JSON.stringify({ ...s, agentStatus: this.agentStatus }));
        } else if (req.url==='/summary') {
          const s = await this.aggregateSummary();
          res.writeHead(200);
          res.end(JSON.stringify(s));
        } else if (req.url==='/alerts') {
          res.writeHead(200);
          res.end(JSON.stringify(this.alertQueue.slice(-30)));
        } else if (req.url==='/decisions') {
          res.writeHead(200);
          res.end(JSON.stringify(this.decisionLog.slice(-10)));
        } else { res.writeHead(404); res.end('{}'); }
      } catch(e) { res.writeHead(500); res.end(JSON.stringify({error:e.message})); }
    }).listen(this.port, () => console.log(`[SystemCoordinator] PORT ${this.port} ✅`));

    // 每5分钟健康检查 + 每30分钟聚合摘要
    setInterval(() => this.healthCheck(), 5 * 60 * 1000);
    setInterval(() => this.aggregateSummary(), 30 * 60 * 1000);
    console.log('[SystemCoordinator] 所有智能体协调中...');
  }
}

new SystemCoordinator().start();
