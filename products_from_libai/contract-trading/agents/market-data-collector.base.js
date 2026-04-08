/**
 * MarketDataCollector - BaseAgent版本
 * 基于BaseAgent框架，保持GitHub原版业务逻辑
 * PORT 19961 | 市场数据采集与发布
 */

const BaseAgent = require('../../lib/agents/base-agent');
const { KlineFetcher } = require('../data/kline-fetcher');
const { MarketDepth } = require('../data/market-depth');

class MarketDataCollector extends BaseAgent {
  constructor(config = {}) {
    super('market-data-collector', 'data-collector', config);
    this.port = 19961;
    this.fetcher = new MarketDepth();
    this.klFetcher = new KlineFetcher();
    this.SYMBOLS = ['LRC','0G','TURBO','FET','SAND','APT'];
    this.latestData = {};
    this.httpServer = null;
  }

  async onStart() {
    // 启动HTTP服务
    this.startHTTPServer();
    
    // 订阅配置更新命令
    await this.subscribe('config:update', this.handleConfigUpdate.bind(this));
    
    // 启动数据采集循环
    this.startCollectionLoop();
    
    console.log(`[MarketDataCollector] 启动完成，监控品种: ${this.SYMBOLS.length}`);
  }

  async onStop() {
    if (this.httpServer) {
      this.httpServer.close();
    }
    if (this.collectionInterval) {
      clearInterval(this.collectionInterval);
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
          symbols: this.SYMBOLS.length,
          latest: Object.keys(this.latestData).length,
          ts: Date.now()
        }));
      } else if (req.url === '/latest') {
        res.writeHead(200);
        res.end(JSON.stringify(this.latestData));
      } else if (req.url === '/symbols') {
        res.writeHead(200);
        res.end(JSON.stringify({ symbols: this.SYMBOLS }));
      } else {
        res.writeHead(404);
        res.end(JSON.stringify({ error: 'Not found' }));
      }
    });

    this.httpServer.listen(this.port, () => {
      console.log(`[MarketDataCollector] PORT ${this.port} ✅`);
    });
  }

  startCollectionLoop() {
    // 立即执行一次采集
    this.collectAll();
    
    // 每2分钟采集一次
    this.collectionInterval = setInterval(() => {
      this.collectAll();
    }, 2 * 60 * 1000);
  }

  async collectAll() {
    for (const sym of this.SYMBOLS) {
      try {
        const data = await this.collectSnapshot(sym);
        if (data) {
          this.latestData[sym] = data;
          
          // 发布市场数据事件
          await this.publish('market:kline', {
            symbol: sym,
            timeframe: '1h',
            closes: data.kline.closes,
            highs: data.kline.highs,
            lows: data.kline.lows,
            volumes: data.kline.volumes,
            lastClose: data.kline.lastClose,
            timestamp: data.kline.timestamp
          });
          
          // 发布现货价格
          await this.publish('market:spot', {
            symbol: sym,
            spotPrice: data.spot,
            timestamp: data.kline.timestamp
          });
          
          // 发布持仓信息
          await this.publish('market:oi', {
            symbol: sym,
            oiValue: data.oi,
            timestamp: data.kline.timestamp
          });
        }
      } catch (err) {
        console.error(`[MarketDataCollector] 采集失败 ${sym}:`, err.message);
      }
      
      // 避免请求过快
      await new Promise(resolve => setTimeout(resolve, 300));
    }
  }

  async collectSnapshot(sym) {
    try {
      const [klines1h, snap] = await Promise.all([
        this.klFetcher.fetchOHLCV(sym, '1h', 60),
        this.fetcher.snapshot(sym)
      ]);
      
      return {
        symbol: sym,
        kline: {
          timestamp: Date.now(),
          closes: this.klFetcher.closes(klines1h),
          highs: this.klFetcher.highs(klines1h),
          lows: this.klFetcher.lows(klines1h),
          volumes: this.klFetcher.volumes(klines1h),
          lastClose: this.klFetcher.closes(klines1h)[this.klFetcher.closes(klines1h).length - 1]
        },
        spot: snap.spot,
        oi: snap.oi,
        basis: snap.basis
      };
    } catch (e) {
      console.error(`[MarketDataCollector] collectSnapshot ${sym}:`, e.message);
      return null;
    }
  }

  async handleConfigUpdate(message) {
    const { config } = message;
    if (config.symbols) {
      this.SYMBOLS = config.symbols;
      console.log(`[MarketDataCollector] 品种列表已更新:`, this.SYMBOLS);
    }
  }

  // 命令处理
  async handleCommand(message) {
    const { action, data } = message.payload;
    
    switch (action) {
      case 'getLatest':
        return this.latestData;
      case 'getSymbols':
        return this.SYMBOLS;
      case 'forceCollect':
        await this.collectAll();
        return { success: true, collected: Object.keys(this.latestData).length };
      default:
        return super.handleCommand(message);
    }
  }
}

module.exports = MarketDataCollector;