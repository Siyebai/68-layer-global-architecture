/**
 * TechnicalSignalGenerator - BaseAgent版本
 * 基于BaseAgent框架，保持GitHub原版业务逻辑
 * PORT 19964 | 技术信号生成
 */

const BaseAgent = require('../../lib/agents/base-agent');
const { Indicators } = require('../indicators/indicators');
const { AdvancedIndicators } = require('../indicators/advanced-indicators');

class TechnicalSignalGenerator extends BaseAgent {
  constructor(config = {}) {
    super('technical-signal-generator', 'signal-generator', config);
    this.port = 19964;
    this.signals = new Map();
    this.eventBuffer = [];
    this.lastKlineData = {};
    this.httpServer = null;
    this.subscriptions = {};
  }

  async onStart() {
    // 启动HTTP服务
    this.startHTTPServer();
    
    // 订阅市场数据事件
    await this.subscribe('market:kline', this.handleKlineUpdate.bind(this));
    
    // 订阅配置更新
    await this.subscribe('config:update', this.handleConfigUpdate.bind(this));
    
    console.log('[TechnicalSignalGenerator] 启动完成，等待市场数据...');
  }

  async onStop() {
    if (this.httpServer) {
      this.httpServer.close();
    }
    // 清理所有订阅
    for (const sub of Object.values(this.subscriptions)) {
      sub.unsubscribe();
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
          signals: this.signals.size,
          buffer: this.eventBuffer.length,
          ts: Date.now()
        }));
      } else if (req.url === '/signals') {
        res.writeHead(200);
        res.end(JSON.stringify(Array.from(this.signals.values())));
      } else if (req.url === '/signal') {
        // GET /signal?symbol=BTC
        const params = new URLSearchParams(req.url.split('?')[1]);
        const symbol = params.get('symbol');
        if (symbol && this.signals.has(symbol)) {
          res.writeHead(200);
          res.end(JSON.stringify(this.signals.get(symbol)));
        } else {
          res.writeHead(404);
          res.end(JSON.stringify({ error: 'Signal not found' }));
        }
      } else {
        res.writeHead(404);
        res.end(JSON.stringify({ error: 'Not found' }));
      }
    });

    this.httpServer.listen(this.port, () => {
      console.log(`[TechnicalSignalGenerator] PORT ${this.port} ✅`);
    });
  }

  async handleKlineUpdate(message) {
    const { symbol, timeframe, closes, highs, lows, volumes, lastClose, timestamp } = message;
    
    // 转换为标准K线格式
    const klines = closes.map((c, i) => ({
      c: c,
      h: highs[i],
      l: lows[i],
      v: volumes ? volumes[i] : 0
    }));
    
    try {
      const signal = await this.generateSignal(symbol, klines);
      if (signal) {
        this.signals.set(symbol, signal);
        
        // 发布技术信号事件
        await this.publish('signal:technical', signal);
      }
    } catch (err) {
      console.error(`[TechnicalSignalGenerator] 生成信号失败 ${symbol}:`, err.message);
    }
  }

  async generateSignal(symbol, klines) {
    if (!klines || klines.length < 50) {
      return null;
    }

    const closes = klines.map(k => k.c);
    const highs = klines.map(k => k.h);
    const lows = klines.map(k => k.l);

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

    return signal;
  }

  assignGrade(strength, trend) {
    if (trend.confidence >= 0.85 && strength >= 0.75) return 'A';
    if (strength >= 0.50) return 'B';
    if (strength >= 0.25) return 'C';
    return 'D';
  }

  async handleConfigUpdate(message) {
    const { config } = message;
    // 可以动态调整参数
    if (config.signalThreshold) {
      // 更新信号阈值配置
      console.log('[TechnicalSignalGenerator] 配置更新:', config);
    }
  }

  // 命令处理扩展
  async handleCommand(message) {
    const { action, data } = message.payload;
    
    switch (action) {
      case 'getSignal':
        const symbol = data?.symbol;
        if (symbol) {
          return this.signals.get(symbol) || null;
        }
        return Array.from(this.signals.values());
      case 'forceGenerate':
        // 强制生成所有已监控品种的信号
        for (const [symbol, klineData] of Object.entries(this.lastKlineData)) {
          if (klineData && klineData.kline) {
            await this.handleKlineUpdate({
              symbol,
              timeframe: '1h',
              ...klineData.kline
            });
          }
        }
        return { success: true, signals: this.signals.size };
      default:
        return super.handleCommand(message);
    }
  }
}

module.exports = TechnicalSignalGenerator;