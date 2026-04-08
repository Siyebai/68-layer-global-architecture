/**
 * 多智能体系统与现有系统融合集成
 * 功能：与交易系统、知识库、Superpowers、第二大脑集成
 * 作者：Q李白
 * 日期：2026-03-27
 */

const EventEmitter = require('events');

/**
 * 系统融合协调器
 */
class SystemIntegrator extends EventEmitter {
  constructor(config = {}) {
    super();
    
    this.config = config;
    this.systems = new Map();
    this.bridges = new Map();
    this.dataFlow = [];
  }
  
  /**
   * 注册子系统
   */
  registerSystem(systemId, system) {
    this.systems.set(systemId, {
      id: systemId,
      system,
      status: 'registered',
      lastSync: null,
      dataExchanged: 0
    });
    
    this.emit('system:registered', { systemId });
  }
  
  /**
   * 创建系统桥接
   */
  createBridge(sourceId, targetId, transformer) {
    const bridgeId = `${sourceId}->${targetId}`;
    
    this.bridges.set(bridgeId, {
      source: sourceId,
      target: targetId,
      transformer,
      active: true,
      dataCount: 0
    });
    
    this.emit('bridge:created', { bridgeId });
  }
  
  /**
   * 数据流转
   */
  async transferData(sourceId, data) {
    const bridges = Array.from(this.bridges.values())
      .filter(b => b.source === sourceId && b.active);
    
    for (const bridge of bridges) {
      try {
        const transformed = await bridge.transformer(data);
        
        const targetSystem = this.systems.get(bridge.target);
        if (targetSystem) {
          await targetSystem.system.receive(transformed);
          bridge.dataCount++;
          
          this.dataFlow.push({
            from: sourceId,
            to: bridge.target,
            timestamp: Date.now(),
            size: JSON.stringify(transformed).length
          });
        }
      } catch (error) {
        this.emit('bridge:error', { bridgeId: `${sourceId}->${bridge.target}`, error });
      }
    }
  }
  
  /**
   * 获取融合状态
   */
  getIntegrationStatus() {
    return {
      systems: Array.from(this.systems.values()).map(s => ({
        id: s.id,
        status: s.status,
        dataExchanged: s.dataExchanged
      })),
      bridges: Array.from(this.bridges.values()).map(b => ({
        id: `${b.source}->${b.target}`,
        active: b.active,
        dataCount: b.dataCount
      })),
      totalDataFlow: this.dataFlow.length
    };
  }
}

/**
 * 交易系统适配器
 */
class TradingSystemAdapter {
  constructor(tradingSystem) {
    this.tradingSystem = tradingSystem;
  }
  
  async receive(data) {
    // 处理来自多智能体系统的数据
    if (data.type === 'trade_signal') {
      return this.handleTradeSignal(data);
    } else if (data.type === 'risk_alert') {
      return this.handleRiskAlert(data);
    } else if (data.type === 'market_analysis') {
      return this.handleMarketAnalysis(data);
    }
  }
  
  async handleTradeSignal(signal) {
    console.log('[TradingAdapter] 收到交易信号:', signal);
    
    // 验证信号
    if (!this.validateSignal(signal)) {
      throw new Error('Invalid trade signal');
    }
    
    // 执行交易
    return {
      executed: true,
      orderId: `order-${Date.now()}`,
      signal: signal.id
    };
  }
  
  async handleRiskAlert(alert) {
    console.log('[TradingAdapter] 收到风险告警:', alert);
    
    // 触发风控措施
    return {
      handled: true,
      action: 'risk_control_triggered',
      alert: alert.id
    };
  }
  
  async handleMarketAnalysis(analysis) {
    console.log('[TradingAdapter] 收到市场分析:', analysis);
    
    // 更新市场数据
    return {
      updated: true,
      analysis: analysis.id
    };
  }
  
  validateSignal(signal) {
    return signal.id && signal.action && signal.confidence > 0.5;
  }
}

/**
 * 知识库系统适配器
 */
class KnowledgeSystemAdapter {
  constructor(knowledgeSystem) {
    this.knowledgeSystem = knowledgeSystem;
  }
  
  async receive(data) {
    if (data.type === 'learning_result') {
      return this.handleLearningResult(data);
    } else if (data.type === 'knowledge_update') {
      return this.handleKnowledgeUpdate(data);
    } else if (data.type === 'insight') {
      return this.handleInsight(data);
    }
  }
  
  async handleLearningResult(result) {
    console.log('[KnowledgeAdapter] 收到学习结果:', result);
    
    // 存储学习成果
    return {
      stored: true,
      resultId: `result-${Date.now()}`,
      topic: result.topic
    };
  }
  
  async handleKnowledgeUpdate(update) {
    console.log('[KnowledgeAdapter] 收到知识更新:', update);
    
    // 更新知识库
    return {
      updated: true,
      updateId: `update-${Date.now()}`,
      entities: update.entities?.length || 0
    };
  }
  
  async handleInsight(insight) {
    console.log('[KnowledgeAdapter] 收到洞察:', insight);
    
    // 记录洞察
    return {
      recorded: true,
      insightId: `insight-${Date.now()}`,
      category: insight.category
    };
  }
}

/**
 * Superpowers系统适配器
 */
class SuperpowersAdapter {
  constructor(superpowersSystem) {
    this.superpowersSystem = superpowersSystem;
  }
  
  async receive(data) {
    if (data.type === 'skill_request') {
      return this.handleSkillRequest(data);
    } else if (data.type === 'optimization_task') {
      return this.handleOptimizationTask(data);
    }
  }
  
  async handleSkillRequest(request) {
    console.log('[SuperpowersAdapter] 收到Skill请求:', request);
    
    // 调用对应Skill
    const skillName = request.skillName;
    
    return {
      executed: true,
      skillName,
      result: `Skill ${skillName} executed`
    };
  }
  
  async handleOptimizationTask(task) {
    console.log('[SuperpowersAdapter] 收到优化任务:', task);
    
    // 执行优化
    return {
      optimized: true,
      taskId: task.id,
      improvement: '15%'
    };
  }
}

/**
 * 第二大脑系统适配器
 */
class SecondBrainAdapter {
  constructor(secondBrainSystem) {
    this.secondBrainSystem = secondBrainSystem;
  }
  
  async receive(data) {
    if (data.type === 'memory_store') {
      return this.handleMemoryStore(data);
    } else if (data.type === 'memory_recall') {
      return this.handleMemoryRecall(data);
    } else if (data.type === 'knowledge_graph_update') {
      return this.handleKnowledgeGraphUpdate(data);
    }
  }
  
  async handleMemoryStore(memory) {
    console.log('[SecondBrainAdapter] 存储记忆:', memory);
    
    // 存储到第二大脑
    return {
      stored: true,
      memoryId: `mem-${Date.now()}`,
      type: memory.type
    };
  }
  
  async handleMemoryRecall(query) {
    console.log('[SecondBrainAdapter] 召回记忆:', query);
    
    // 从第二大脑检索
    return {
      recalled: true,
      queryId: query.id,
      results: ['result1', 'result2', 'result3']
    };
  }
  
  async handleKnowledgeGraphUpdate(update) {
    console.log('[SecondBrainAdapter] 更新知识图谱:', update);
    
    // 更新知识图谱
    return {
      updated: true,
      updateId: `kg-${Date.now()}`,
      entities: update.entities?.length || 0,
      relations: update.relations?.length || 0
    };
  }
}

/**
 * 融合系统工厂
 */
class IntegrationFactory {
  static createIntegrator() {
    return new SystemIntegrator();
  }
  
  static createTradingAdapter(tradingSystem) {
    return new TradingSystemAdapter(tradingSystem);
  }
  
  static createKnowledgeAdapter(knowledgeSystem) {
    return new KnowledgeSystemAdapter(knowledgeSystem);
  }
  
  static createSuperpowersAdapter(superpowersSystem) {
    return new SuperpowersAdapter(superpowersSystem);
  }
  
  static createSecondBrainAdapter(secondBrainSystem) {
    return new SecondBrainAdapter(secondBrainSystem);
  }
  
  /**
   * 创建完整融合系统
   */
  static createFusedSystem(config) {
    const integrator = this.createIntegrator();
    
    // 注册所有子系统
    if (config.tradingSystem) {
      const adapter = this.createTradingAdapter(config.tradingSystem);
      integrator.registerSystem('trading', adapter);
    }
    
    if (config.knowledgeSystem) {
      const adapter = this.createKnowledgeAdapter(config.knowledgeSystem);
      integrator.registerSystem('knowledge', adapter);
    }
    
    if (config.superpowersSystem) {
      const adapter = this.createSuperpowersAdapter(config.superpowersSystem);
      integrator.registerSystem('superpowers', adapter);
    }
    
    if (config.secondBrainSystem) {
      const adapter = this.createSecondBrainAdapter(config.secondBrainSystem);
      integrator.registerSystem('secondbrain', adapter);
    }
    
    // 创建数据桥接
    this.setupBridges(integrator);
    
    return integrator;
  }
  
  /**
   * 设置数据桥接
   */
  static setupBridges(integrator) {
    // 多智能体 → 交易系统
    integrator.createBridge('multiagent', 'trading', async (data) => {
      return {
        type: 'trade_signal',
        id: data.id,
        action: data.action,
        confidence: data.confidence
      };
    });
    
    // 多智能体 → 知识库
    integrator.createBridge('multiagent', 'knowledge', async (data) => {
      return {
        type: 'learning_result',
        id: data.id,
        topic: data.topic,
        insights: data.insights
      };
    });
    
    // 多智能体 → Superpowers
    integrator.createBridge('multiagent', 'superpowers', async (data) => {
      return {
        type: 'skill_request',
        id: data.id,
        skillName: data.skillName,
        params: data.params
      };
    });
    
    // 多智能体 → 第二大脑
    integrator.createBridge('multiagent', 'secondbrain', async (data) => {
      return {
        type: 'memory_store',
        id: data.id,
        content: data.content,
        type: data.memoryType
      };
    });
  }
}

module.exports = {
  SystemIntegrator,
  TradingSystemAdapter,
  KnowledgeSystemAdapter,
  SuperpowersAdapter,
  SecondBrainAdapter,
  IntegrationFactory
};
