/**
 * multi-dimension-analyzer.js — 五维综合分析智能体
 * PORT 19966 | 整合费率/OI/多空比/趋势/Z-score五维数据
 * 2026-03-29
 */
'use strict';
const http = require('http');
const { AdvancedIndicators } = require('../indicators/advanced-indicators');

class MultiDimensionAnalyzer {
  constructor() {
    this.port = 19966;
    this.analyses = new Map();
    this.eventBuffer = [];
  }

  publishEvent(type, payload) {
    const evt = { type, payload, ts: Date.now() };
    this.eventBuffer.push(evt);
    fetch('http://127.0.0.1:19958/publish', {
      method: 'POST',
      body: JSON.stringify({
        event: type,
        payload,
        source: 'multi-dimension-analyzer'
      })
    }).catch(()=>{});
  }

  analyzeSymbol(symbol, marketData, technicalSignal) {
    if (!marketData || !technicalSignal) return null;

    // 五维评分 (各维0-100分)
    const dims = {
      fundingRate: this.scoreFundingRate(marketData),      // 费率维度
      oiAnalysis: this.scoreOI(marketData),                 // OI维度
      longShortRatio: this.scoreLongShortRatio(marketData), // 多空比维度
      trendStructure: this.scoreTrend(technicalSignal),     // 趋势维度
      meanReversion: this.scoreMeanReversion(technicalSignal) // Z-score维度
    };

    // 综合加权评分(权重相等各20%)
    const confidence = (
      dims.fundingRate * 0.2 +
      dims.oiAnalysis * 0.2 +
      dims.longShortRatio * 0.2 +
      dims.trendStructure * 0.2 +
      dims.meanReversion * 0.2
    );

    const analysis = {
      symbol,
      dimensions: dims,
      confidence: Math.min(100, Math.max(0, confidence)),
      recommendation: this.getRecommendation(confidence, technicalSignal),
      riskLevel: this.getRiskLevel(dims),
      expectedRR: this.calcExpectedRR(marketData, technicalSignal),
      timestamp: Date.now()
    };

    this.analyses.set(symbol, analysis);
    this.publishEvent('decision:analysis', analysis);
    return analysis;
  }

  scoreFundingRate(marketData) {
    const rate = marketData.oi?.fundingRate || 0;
    // 费率越负，分数越高
    if (rate < -0.005) return 100;    // 黄金(<-0.5%)
    if (rate < -0.003) return 80;     // 优质(<-0.3%)
    if (rate < -0.001) return 40;     // 正常(<-0.1%)
    return 10;                        // 不值得
  }

  scoreOI(marketData) {
    const oiAnomaly = AdvancedIndicators.checkOIAnomaly(marketData.oi?.oiChange4h || 0);
    if (oiAnomaly.anomaly) return 40; // 异常减分
    return 70;                        // 正常
  }

  scoreLongShortRatio(marketData) {
    // 多空比接近1.0最好(均衡)
    const ratio = marketData.ratio || 1.0;
    const diff = Math.abs(ratio - 1.0);
    return Math.max(10, 100 - diff * 50);
  }

  scoreTrend(technicalSignal) {
    if (technicalSignal.trend?.confidence >= 0.85) return 90;
    if (technicalSignal.trend?.confidence >= 0.6) return 70;
    return 40;
  }

  scoreMeanReversion(technicalSignal) {
    const zscore = Math.abs(parseFloat(technicalSignal.zscore || 0));
    if (zscore > 2.0) return 100;  // 极端
    if (zscore > 1.0) return 70;   // 明显
    if (zscore > 0.5) return 40;   // 中等
    return 20;                     // 弱
  }

  getRecommendation(confidence, sig) {
    if (confidence >= 80 && sig.direction === 'long') return 'STRONG_BUY';
    if (confidence >= 70 && sig.direction === 'long') return 'BUY';
    if (confidence >= 80 && sig.direction === 'short') return 'STRONG_SELL';
    if (confidence >= 70 && sig.direction === 'short') return 'SELL';
    return 'NEUTRAL';
  }

  getRiskLevel(dims) {
    const avgRisk = (100 - (dims.fundingRate + dims.oiAnalysis) / 2) / 100;
    if (avgRisk > 0.7) return 'HIGH';
    if (avgRisk > 0.4) return 'MEDIUM';
    return 'LOW';
  }

  calcExpectedRR(marketData, sig) {
    const rate = marketData.oi?.fundingRate || 0;
    const rr = AdvancedIndicators.calcArbitrageRR(rate, 50, 3);
    return parseFloat(rr.riskRewardRatio);
  }

  async start() {
    console.log('[MultiDimensionAnalyzer] 启动中...');

    http.createServer((req, res) => {
      res.setHeader('Content-Type', 'application/json');
      if (req.url === '/health') {
        res.writeHead(200);
        res.end(JSON.stringify({
          ok: true,
          analyses: this.analyses.size,
          ts: Date.now()
        }));
      } else if (req.url === '/analyses') {
        res.writeHead(200);
        res.end(JSON.stringify(Array.from(this.analyses.values())));
      } else {
        res.writeHead(404);
        res.end('{}');
      }
    }).listen(this.port, () => {
      console.log(`[MultiDimensionAnalyzer] PORT ${this.port} ✅`);
    });
  }
}

new MultiDimensionAnalyzer().start();
