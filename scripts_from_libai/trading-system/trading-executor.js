#!/usr/bin/env node
/**
 * TradingExecutor - 智能交易执行器 (集成入口)
 * 协调所有交易模块，提供统一接口
 * 作者: C李白 | 2026-04-02
 */

const MarketDataCollector = require('./market-data-collector');
const SignalGenerator = require('./signal-generator');
const RiskManager = require('./risk-manager');
const OrderExecutor = require('./order-executor');
const PerformanceAnalyzer = require('./performance-analyzer');

class TradingExecutor {
  constructor(v72System) {
    this.v72System = v72System;
    this.initialized = false;
    this.collector = null;
    this.signalGenerator = null;
    this.riskManager = null;
    this.orderExecutor = null;
    this.performanceAnalyzer = null;
    
    this.config = {
      trading: {
        enabled: true,
        dryRun: true, // 默认模拟模式
        maxConcurrentTrades: 10,
        initialCapital: 10000,
        exchanges: {
          okx: {
            enabled: true,
            apiKey: process.env.OKX_API_KEY || '',
            secret: process.env.OKX_SECRET || '',
            passphrase: process.env.OKX_PASSPHRASE || ''
          }
        }
      },
      risk: {
        maxPositionSize: 1000,
        maxDrawdown: 0.15,
        stopLoss: 0.02,
        takeProfit: 0.04,
        dailyLossLimit: 0.05
      }
    };
  }

  /**
   * 初始化交易系统
   */
  async initialize() {
    console.log('\n🏦 初始化智能交易执行系统...');
    
    try {
      // 1. 初始化市场数据收集器
      this.collector = new MarketDataCollector();
      await this.collector.initialize();
      console.log('✅ 市场数据收集器已启动');
      
      // 2. 初始化信号生成器
      this.signalGenerator = new SignalGenerator(this.collector, this.v72System);
      await this.signalGenerator.initialize();
      console.log('✅ 信号生成器已启动');
      
      // 3. 初始化风险管理器
      this.riskManager = new RiskManager(this.config.risk);
      await this.riskManager.initialize();
      console.log('✅ 风险管理器已启动');
      
      // 4. 初始化订单执行器
      this.orderExecutor = new OrderExecutor(this.config.trading.exchanges);
      await this.orderExecutor.initialize();
      console.log('✅ 订单执行器已启动');
      
      // 5. 初始化绩效分析器
      this.performanceAnalyzer = new PerformanceAnalyzer();
      await this.performanceAnalyzer.initialize();
      console.log('✅ 绩效分析器已启动');
      
      // 6. 连接各模块
      this.setupModuleConnections();
      
      // 7. 注册到V7.2系统
      this.registerToV72();
      
      // 8. 启动交易循环
      this.startTradingLoop();
      
      this.initialized = true;
      console.log('✅ 智能交易执行系统已完全启动');
      console.log(`   模式: ${this.config.trading.dryRun ? '模拟' : '实盘'}`);
      console.log(`   初始资金: $${this.config.trading.initialCapital}`);
      console.log(`   最大并发: ${this.config.trading.maxConcurrentTrades}`);
      
    } catch (error) {
      console.error('❌ 交易系统初始化失败:', error.message);
      throw error;
    }
  }

  /**
   * 建立模块间连接
   */
  setupModuleConnections() {
    // 信号生成器 → 风险管理器
    this.signalGenerator.onSignal(async (signal) => {
      const riskAssessment = await this.riskManager.assess(signal);
      if (riskAssessment.approved) {
        await this.orderExecutor.execute(riskAssessment.order);
      }
    });
    
    // 订单执行器 → 绩效分析器
    this.orderExecutor.onOrderUpdate(async (order) => {
      await this.performanceAnalyzer.recordOrder(order);
    });
    
    // 绩效分析器 → V35.0学习
    if (this.v72System.v35DeepIntegration) {
      this.performanceAnalyzer.onPerformanceUpdate((metrics) => {
        this.v72System.v35DeepIntegration.recordPerformance(metrics);
      });
    }
  }

  /**
   * 注册到V7.2系统
   */
  registerToV72() {
    if (this.v72System) {
      this.v72System.tradingSystem = this;
      this.v72System.executeTrade = this.executeTrade.bind(this);
      this.v72System.getTradingStats = this.getStats.bind(this);
      console.log('[Trading] 已注册到V7.2系统');
    }
  }

  /**
   * 启动交易循环
   */
  startTradingLoop() {
    // 每3秒检查一次交易机会 (超高频)
    setInterval(async () => {
      if (!this.initialized) return;
      
      try {
        await this.scanForOpportunities();
      } catch (error) {
        console.error('[Trading] 交易循环错误:', error.message);
      }
    }, 3000);
    
    // 每10秒更新一次持仓
    setInterval(async () => {
      if (!this.initialized) return;
      
      try {
        await this.updatePositions();
      } catch (error) {
        console.error('[Trading] 持仓更新错误:', error.message);
      }
    }, 10000);
    
    console.log('[Trading] 交易循环已启动 (3秒扫描, 10秒持仓更新)');
  }

  /**
   * 扫描交易机会
   */
  async scanForOpportunities() {
    // 1. 获取最新市场数据
    const marketData = this.collector.getLatest();
    if (!marketData || marketData.length === 0) return;
    
    // 2. 生成交易信号
    const signals = await this.signalGenerator.generate(marketData);
    
    // 3. 评估并执行 (通过事件机制)
    for (const signal of signals) {
      // 信号已通过事件处理器传递给风险管理器和执行器
      console.log(`[Trading] 发现信号: ${signal.symbol} ${signal.action} (置信度: ${signal.confidence}%)`);
    }
  }

  /**
   * 更新持仓状态
   */
  async updatePositions() {
    if (!this.orderExecutor) return;
    
    const positions = await this.orderExecutor.getPositions();
    this.riskManager.updatePositions(positions);
    
    // 检查止损止盈
    const adjustments = this.riskManager.checkStopLossTakeProfit(positions);
    for (const adj of adjustments) {
      await this.orderExecutor.adjustPosition(adj);
    }
  }

  /**
   * 手动执行交易 (外部接口)
   */
  async executeTrade(signal) {
    if (!this.initialized) {
      throw new Error('交易系统未初始化');
    }
    
    // 风险评估
    const assessment = await this.riskManager.assess(signal);
    if (!assessment.approved) {
      return { success: false, reason: assessment.reason };
    }
    
    // 执行订单
    const result = await this.orderExecutor.execute(assessment.order);
    
    // 记录绩效
    await this.performanceAnalyzer.recordOrder(result);
    
    return result;
  }

  /**
   * 获取交易统计
   */
  getStats() {
    return {
      initialized: this.initialized,
      mode: this.config.trading.dryRun ? '模拟' : '实盘',
      capital: this.config.trading.initialCapital,
      collector: this.collector?.getStats(),
      signalGenerator: this.signalGenerator?.getStats(),
      riskManager: this.riskManager?.getStats(),
      orderExecutor: this.orderExecutor?.getStats(),
      performanceAnalyzer: this.performanceAnalyzer?.getStats(),
      uptime: this.collector?.stats?.startTime ? Date.now() - this.collector.stats.startTime : 0
    };
  }

  /**
   * 获取系统状态 (供V7.2 getStatus调用)
   */
  getStatus() {
    return {
      name: 'trading-executor',
      running: this.initialized,
      version: '1.0.0',
      mode: this.config.trading.dryRun ? 'dry-run' : 'live',
      stats: {
        capital: this.config.trading.initialCapital,
        signalsGenerated: this.signalGenerator?.stats.signalsGenerated || 0,
        ordersExecuted: this.orderExecutor?.stats.ordersExecuted || 0,
        ordersFilled: this.orderExecutor?.stats.ordersFilled || 0,
        totalPnl: this.performanceAnalyzer?.stats.totalPnl || 0,
        winRate: this.performanceAnalyzer?.stats.winRate || 0,
        activePositions: this.orderExecutor?.stats.activePositions || 0
      },
      risk: {
        maxDrawdown: this.riskManager?.stats.maxDrawdown || 0,
        currentDrawdown: this.riskManager?.stats.currentDrawdown || 0,
        riskLevel: this.riskManager?.stats.riskLevel || 'low'
      },
      exchanges: Object.keys(this.config.trading.exchanges).filter(k => this.config.trading.exchanges[k].enabled)
    };
  }

  /**
   * 关闭交易系统
   */
  async shutdown() {
    console.log('[TradingExecutor] 正在关闭...');
    
    if (this.collector) await this.collector.shutdown();
    if (this.orderExecutor) await this.orderExecutor.shutdown();
    
    this.initialized = false;
    console.log('[TradingExecutor] ✅ 已关闭');
  }
}

module.exports = TradingExecutor;
