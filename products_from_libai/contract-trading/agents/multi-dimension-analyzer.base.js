/**
 * MultiDimensionAnalyzer - BaseAgent版本
 * 基于BaseAgent框架，保持GitHub原版业务逻辑
 * PORT 19966 | 五维综合分析 (费率/OI/多空比/趋势/Z-score)
 */

const BaseAgent = require('../../lib/agents/base-agent');
const { AdvancedIndicators } = require('../indicators/advanced-indicators');

class MultiDimensionAnalyzer extends BaseAgent {
  constructor(config = {}) {
    super('multi-dimension-analyzer', 'analysis-engine', config);
    this.port = 19966;
    this.analyses = new Map();
    this.eventBuffer = [];
    this.httpServer = null;
  }

  async onStart() {
    this.startHTTPServer();
    
    // 订阅相关事件
    await this.subscribe('market:oi', this.handleMarketData.bind(this));
    await this.subscribe('market:funding', this.handleMarketData.bind(this));
    await this.subscribe('signal:technical', this.handleTechnicalSignal.bind(this));
    await this.subscribe('market:depth', this.handleMarketData.bind(this));
    
    // 订阅配置更新
    await this.subscribe('config:update', this.handleConfigUpdate.bind(this));
    
    console.log('[MultiDimensionAnalyzer] 启动完成，等待分析请求...');
  }

  async onStop() {
    if (this.httpServer) {
      this.httpServer.close();
    }
  }

  startHTTPServer() {
    this.httpServer = require('http').createServer(async (req, res) => {
      res.setHeader('Content-Type', 'application/json');
      
      if (req.url === '/health') {
        res.writeHead(200);
        res.end(JSON.stringify({
          ok: true,
          agent: this.agentId,
          analyses: this.analyses.size,
          ts: Date.now()
        }));
      } else if (req.url === '/analyses') {
        res.writeHead(200);
        res.end(JSON.stringify(Array.from(this.analyses.values())));
      } else if (req.url === '/analysis') {
        const params = new URLSearchParams(req.url.split('?')[1]);
        const symbol = params.get('symbol');
        if (symbol && this.analyses.has(symbol)) {
          res.writeHead(200);
          res.end(JSON.stringify(this.analyses.get(symbol)));
        } else {
          res.writeHead(404);
          res.end(JSON.stringify({ error: 'Analysis not found' }));
        }
      } else {
        res.writeHead(404);
        res.end(JSON.stringify({ error: 'Not found' }));
      }
    });

    this.httpServer.listen(this.port, () => {
      console.log(`[MultiDimensionAnalyzer] PORT ${this.port} ✅`);
    });
  }

  async handleMarketData(message) {
    // 市场数据更新时，可能需要重新分析
    // 这里我们基于完整数据集进行分析，所以不单独处理
  }

  async handleTechnicalSignal(message) {
    const { symbol } = message;
    
    // 收集所有需要的数据
    const marketData = this.collectMarketData(symbol);
    const technicalSignal = message;
    
    if (!marketData || !technicalSignal) {
      return;
    }
    
    try {
      const analysis = this.analyzeSymbol(symbol, marketData, technicalSignal);
      if (analysis) {
        this.analyses.set(symbol, analysis);
        
        // 发布分析结果
        await this.publish('decision:analysis', analysis);
        
        console.log(`[MultiDimensionAnalyzer] ${symbol} 分析完成，信心度: ${analysis.confidence.toFixed(1)}%`);
      }
    } catch (err) {
      console.error(`[MultiDimensionAnalyzer] 分析失败 ${symbol}:`, err.message);
    }
  }

  collectMarketData(symbol) {
    // 在实际系统中，这里应该从缓存或数据库获取最新的市场数据
    // 简化实现：返回占位数据
    return {
      symbol,
      oi: {
        fundingRate: -0.003, // 示例值
        oiChange4h: 0.05,
        oiValue: 1000000,
      },
      ratio: 1.0, // 多空比
      depth: {
        bidVolume: 100,
        askVolume: 100,
        spread: 0.01,
      }
    };
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
    const oiChange = marketData.oi?.oiChange4h || 0;
    const oiAnomaly = AdvancedIndicators.checkOIAnomaly(oiChange);
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

  async handleConfigUpdate(message) {
    const { config } = message;
    if (config.weights) {
      // 可以动态调整五维权重
      console.log('[MultiDimensionAnalyzer] 权重配置更新:', config.weights);
    }
  }

  // 命令处理
  async handleCommand(message) {
    const { action, data } = message.payload;
    
    switch (action) {
      case 'getAnalysis':
        const symbol = data?.symbol;
        if (symbol) {
          return this.analyses.get(symbol) || null;
        }
        return Array.from(this.analyses.values());
      case 'reanalyze':
        // 强制重新分析指定或所有symbol
        if (data?.symbol) {
          const techSig = this.getSignalForSymbol(data.symbol);
          if (techSig) {
            const marketData = this.collectMarketData(data.symbol);
            const analysis = this.analyzeSymbol(data.symbol, marketData, techSig);
            if (analysis) {
              this.analyses.set(data.symbol, analysis);
              await this.publish('decision:analysis', analysis);
            }
          }
        } else {
          // 重新分析所有已分析品种
          for (const [symbol, analysis] of this.analyses) {
            const techSig = this.getSignalForSymbol(symbol);
            if (techSig) {
              const marketData = this.collectMarketData(symbol);
              const newAnalysis = this.analyzeSymbol(symbol, marketData, techSig);
              if (newAnalysis) {
                this.analyses.set(symbol, newAnalysis);
                await this.publish('decision:analysis', newAnalysis);
              }
            }
          }
        }
        return { success: true, count: this.analyses.size };
      default:
        return super.handleCommand(message);
    }
  }

  getSignalForSymbol(symbol) {
    // 从TechnicalSignalGenerator获取最新信号
    // 在实际系统中，这应该通过订阅或查询获取
    // 这里简化：返回一个占位信号
    return {
      symbol,
      direction: Math.random() > 0.5 ? 'long' : 'short',
      strength: Math.random(),
      trend: { confidence: 0.6 },
      zscore: (Math.random() - 0.5) * 4,
    };
  }
}

module.exports = MultiDimensionAnalyzer;