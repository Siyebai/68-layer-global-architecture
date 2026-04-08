// 自适应风险控制模块
const { BaseAgent } = require('./ultimate-v26-autonomous-learning');

class AdaptiveRiskControl extends BaseAgent {
  constructor(id, teamId) {
    super(id, teamId, 'adaptive');
    this.role = 'risk-control';
    this.riskParameters = {
      maxPositionSize: 1000,
      maxDrawdown: 0.05,
      stopLoss: 0.02,
      takeProfit: 0.04,
      maxConcurrentTrades: 10
    };
    this.performanceHistory = [];
    this.adjustmentCount = 0;
  }

  onData(data) {
    // 监听所有交易和风险事件
    if (data.type === 'trade') {
      this.assessTradeRisk(data);
    } else if (data.type === 'market') {
      this.evaluateMarketRisk(data);
    } else if (data.type === 'risk-alert') {
      this.handleRiskAlert(data);
    }
  }

  assessTradeRisk(trade) {
    const riskScore = this.calculateRiskScore(trade);
    
    if (riskScore > 0.8) {
      this.emit('risk-critical', {
        tradeId: trade.id,
        riskScore,
        recommendation: 'reject'
      });
    } else if (riskScore > 0.6) {
      this.emit('risk-warning', {
        tradeId: trade.id,
        riskScore,
        recommendation: 'reduce-size'
      });
    }
    
    this.state.messageCount++;
  }

  evaluateMarketRisk(marketData) {
    // 评估整体市场风险
    const volatility = this.calcVolatility(marketData);
    const trend = this.detectTrend(marketData);
    
    if (volatility > 0.03) {
      this.adjustParameters('maxPositionSize', 0.8); // 减少仓位大小
    }
    
    if (trend === 'bearish') {
      this.adjustParameters('maxConcurrentTrades', 0.7); // 减少并发交易
    }
  }

  // V7.2兼容接口
  increaseSensitivity() {
    // 提高风险敏感度 (降低阈值)
    this.riskParameters.maxPositionSize *= 0.9;
    this.riskParameters.stopLoss = Math.max(0.01, this.riskParameters.stopLoss * 0.9);
    console.log('[AdaptiveRiskControl] 风险敏感度已提升');
  }

  handleRiskAlert(alert) {
    // 处理风险警报
    this.adjustmentCount++;
    this.logRiskEvent(alert);
    
    // 立即执行保护措施
    if (alert.level === 'critical') {
      this.emergencyProtocol(alert);
    }
  }

  calculateRiskScore(trade) {
    // 计算交易风险评分 (0-1)
    let score = 0;
    
    // 基于市场波动率
    if (trade.volatility) score += trade.volatility * 0.3;
    
    // 基于仓位大小
    const positionRatio = trade.amount / this.riskParameters.maxPositionSize;
    score += Math.min(positionRatio, 1) * 0.3;
    
    // 基于当前市场趋势
    const trendRisk = this.getTrendRisk(trade.symbol);
    score += trendRisk * 0.2;
    
    // 基于历史表现
    const performanceRisk = this.getPerformanceRisk();
    score += performanceRisk * 0.2;
    
    return Math.min(score, 1);
  }

  calcVolatility(data) {
    // 计算价格波动率
    if (data.high && data.low) {
      return (data.high - data.low) / data.low;
    }
    return 0.01;
  }

  detectTrend(data) {
    // 简单趋势检测
    if (data.close > data.open) return 'bullish';
    if (data.close < data.open) return 'bearish';
    return 'neutral';
  }

  getTrendRisk(symbol) {
    // 获取趋势风险系数
    const recent = this.performanceHistory.slice(-10);
    if (recent.length < 5) return 0.5;
    
    const trend = recent.reduce((sum, item) => sum + item.trendScore, 0) / recent.length;
    return Math.abs(trend);
  }

  getPerformanceRisk() {
    // 基于历史表现的风险
    if (this.performanceHistory.length === 0) return 0.5;
    
    const winRate = this.calcWinRate();
    return 1 - winRate; // 胜率越低，风险越高
  }

  calcWinRate() {
    const wins = this.performanceHistory.filter(p => p.profit > 0).length;
    return wins / this.performanceHistory.length;
  }

  adjustParameters(param, factor) {
    // 自适应调整风险参数
    const oldValue = this.riskParameters[param];
    if (oldValue) {
      this.riskParameters[param] = oldValue * factor;
      this.adjustmentCount++;
      this.emit('parameter-adjusted', {
        param,
        oldValue,
        newValue: this.riskParameters[param],
        factor
      });
    }
  }

  emergencyProtocol(alert) {
    // 紧急风险处理协议
    this.emit('emergency-shutdown', {
      reason: alert.reason,
      timestamp: Date.now()
    });
  }

  logRiskEvent(event) {
    this.performanceHistory.push({
      timestamp: Date.now(),
      type: event.type,
      level: event.level,
      impact: event.impact || 0
    });
    
    // 保持历史记录不超过1000条
    if (this.performanceHistory.length > 1000) {
      this.performanceHistory = this.performanceHistory.slice(-500);
    }
  }

  start() {
    // 启动风险控制周期检查 (30秒间隔)
    this.interval = setInterval(() => {
      this.periodicCheck();
    }, 30 * 1000);
    this.running = true;
    console.log(`[${this.id}] 自适应风险控制已启动 (30秒间隔)`);
  }

  stop() {
    if (this.interval) {
      clearInterval(this.interval);
      this.interval = null;
    }
    this.running = false;
    console.log(`[${this.id}] 自适应风险控制已停止`);
  }

  async periodicCheck() {
    // 周期性风险评估
    try {
      // 检查当前风险参数是否需要调整
      this.evaluateCurrentRisk();
    } catch (err) {
      console.error(`[${this.id}] 周期检查失败:`, err.message);
    }
  }

  evaluateCurrentRisk() {
    // 基于历史表现调整风险参数
    if (this.performanceHistory.length > 10) {
      const recent = this.performanceHistory.slice(-20);
      const avgImpact = recent.reduce((sum, e) => sum + (e.impact || 0), 0) / recent.length;
      
      if (avgImpact > 0.1) {
        // 近期风险事件较多，收紧风险控制
        this.adjustParameters('maxPositionSize', 0.9);
        this.adjustParameters('maxConcurrentTrades', 0.9);
      } else if (avgImpact < 0.02) {
        // 风险较低，适当放宽
        this.adjustParameters('maxPositionSize', 1.1);
      }
    }
  }

  getHealth() {
    const base = super.getHealth();
    return {
      ...base,
      role: this.role,
      riskParameters: this.riskParameters,
      adjustments: this.adjustmentCount,
      historySize: this.performanceHistory.length,
      running: this.running
    };
  }
}

module.exports = { AdaptiveRiskControl };
