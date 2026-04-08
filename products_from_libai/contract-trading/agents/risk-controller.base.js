/**
 * RiskController - BaseAgent版本
 * 基于BaseAgent框架，保持GitHub原版业务逻辑
 * PORT 19967 | 风险检查+仓位计算
 */

const BaseAgent = require('../../lib/agents/base-agent');
const { KellyCriterion } = require('../risk/kelly-criterion');

class RiskController extends BaseAgent {
  constructor(config = {}) {
    super('risk-controller', 'risk-manager', config);
    this.port = 19967;
    this.httpServer = null;
    this.positions = new Map();
    this.approvals = [];
    
    // 风险配置
    this.maxPositionSize = config.maxPositionSize || 0.06; // 6% of equity
    this.maxDailyLoss = config.maxDailyLoss || 5.0; // 5U
    this.kelly = new KellyCriterion({
      winRate: 0.55,
      avgWin: 1.5,
      avgLoss: 1.0,
    });
  }

  async onStart() {
    this.startHTTPServer();
    
    // 订阅分析事件
    await this.subscribe('decision:analysis', this.handleAnalysis.bind(this));
    
    // 订阅持仓更新
    await this.subscribe('execution:order', this.handleExecution.bind(this));
    
    // 启动定时检查
    this.startPeriodicChecks();
    
    console.log('[RiskController] 启动完成，等待决策请求...');
  }

  async onStop() {
    if (this.httpServer) {
      this.httpServer.close();
    }
    if (this.periodicInterval) {
      clearInterval(this.periodicInterval);
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
          approvals: this.approvals.length,
          positions: this.positions.size,
          ts: Date.now()
        }));
      } else if (req.url === '/approvals') {
        // GET /approvals - 返回待审批列表
        res.writeHead(200);
        res.end(JSON.stringify(this.approvals.slice(-30)));
      } else if (req.url === '/positions') {
        res.writeHead(200);
        res.end(JSON.stringify(Array.from(this.positions.values())));
      } else {
        res.writeHead(404);
        res.end(JSON.stringify({ error: 'Not found' }));
      }
    });

    this.httpServer.listen(this.port, () => {
      console.log(`[RiskController] PORT ${this.port} ✅`);
    });
  }

  startPeriodicChecks() {
    // 每5分钟检查一次整体风险
    this.periodicInterval = setInterval(() => {
      this.checkDailyLimits();
    }, 5 * 60 * 1000);
  }

  async handleAnalysis(message) {
    const { symbol, confidence, riskLevel, recommendation } = message;
    
    console.log(`[RiskController] 收到分析请求: ${symbol} (信心度: ${confidence})`);
    
    // 计算仓位大小
    const positionSize = this.calculatePositionSize(confidence, recommendation);
    
    // 检查当前持仓
    const currentPosition = this.positions.get(symbol);
    
    // 风险评估
    const approved = this.evaluateRisk(symbol, positionSize, riskLevel, currentPosition);
    
    const approval = {
      symbol,
      approved,
      positionSize,
      stopLoss: this.calculateStopLoss(recommendation),
      takeProfit: this.calculateTakeProfit(recommendation),
      reason: approved ? '通过' : this.getRejectionReason(riskLevel, positionSize),
      ts: Date.now()
    };
    
    this.approvals.push(approval);
    if (this.approvals.length > 100) {
      this.approvals.shift();
    }
    
    // 发布审批结果
    await this.publish('decision:risk_approval', approval);
    
    console.log(`[RiskController] ${symbol} ${approved ? '✅ 批准' : '❌ 拒绝'}: ${approval.reason}`);
  }

  calculatePositionSize(confidence, recommendation) {
    // 基于凯利准则和信心度计算
    const kellyFraction = this.kelly.getOptimalFraction();
    const baseSize = kellyFraction * this.maxPositionSize;
    
    // 信心度调整
    const confidenceMultiplier = confidence || 0.5;
    const adjustedSize = baseSize * confidenceMultiplier;
    
    // 限制在范围内
    return Math.min(adjustedSize, this.maxPositionSize);
  }

  calculateStopLoss(recommendation) {
    // 基于ATR或固定比例
    const atr = recommendation?.indicators?.atr || 0.02;
    const stopDistance = Math.max(atr * 2, 0.02); // 至少2%
    return stopDistance;
  }

  calculateTakeProfit(recommendation) {
    const stopLoss = this.calculateStopLoss(recommendation);
    const riskRewardRatio = 2.0; // 2:1 风险回报
    return stopLoss * riskRewardRatio;
  }

  evaluateRisk(symbol, positionSize, riskLevel, currentPosition) {
    // 检查是否已有持仓
    if (currentPosition) {
      return false; // 已有持仓，避免重复开仓
    }
    
    // 检查风险等级
    if (riskLevel === 'HIGH') {
      return false;
    }
    
    // 检查仓位大小
    if (positionSize <= 0 || positionSize > this.maxPositionSize) {
      return false;
    }
    
    return true;
  }

  getRejectionReason(riskLevel, positionSize) {
    if (riskLevel === 'HIGH') return '风险等级过高';
    if (positionSize <= 0) return '仓位计算为零';
    if (positionSize > this.maxPositionSize) return '仓位超过上限';
    return '未知原因';
  }

  async handleExecution(message) {
    const { symbol, side, size, orderId, filledPrice } = message;
    
    // 更新持仓记录
    if (side === 'buy' || side === 'long') {
      this.positions.set(symbol, {
        symbol,
        side: 'long',
        size,
        entryPrice: filledPrice,
        entryTime: Date.now(),
        orderId,
      });
    }
  }

  checkDailyLimits() {
    // 这里应该检查今日总盈亏
    // 简化实现：检查持仓数量等
    console.log('[RiskController] 执行定期风险检查...');
  }

  // 命令处理
  async handleCommand(message) {
    const { action, data } = message.payload;
    
    switch (action) {
      case 'getApprovals':
        return this.approvals.slice(-30);
      case 'getPositions':
        return Array.from(this.positions.values());
      case 'setConfig':
        if (data.maxPositionSize) this.maxPositionSize = data.maxPositionSize;
        if (data.maxDailyLoss) this.maxDailyLoss = data.maxDailyLoss;
        return { success: true };
      case 'resetDaily':
        this.approvals = [];
        this.positions.clear();
        return { success: true };
      default:
        return super.handleCommand(message);
    }
  }
}

module.exports = RiskController;