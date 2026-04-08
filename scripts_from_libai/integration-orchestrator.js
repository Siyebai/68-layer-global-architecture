#!/usr/bin/env node
/**
 * 多智能体通信桥接 - 主启动器
 * 连接通信系统与交易/知识/监控系统
 */

const path = require('path');
const fs = require('fs');

const ROOT = path.join(__dirname, '..');
const EVENT_BUS_URL = process.env.EVENT_BUS_URL || 'ws://localhost:19958';

// 引入桥接适配器
const ContractBridge = require('../contract-trading/agents/communication-bridge');
const KnowledgeBridge = require('../multi-agent-system/knowledge-adapter');
const MonitoringBridge = require('../multi-agent-system/monitoring-adapter');

// 配置
const CONFIG = {
  contractTrading: {
    dryRun: true,  // 默认模拟模式
    totalCapital: 25, // 合约专用资金 25U
    riskPerTrade: 0.02, // 2%
    maxPositionSize: 10 // U
  },
  knowledge: {
    enabled: true,
    storagePath: path.join(ROOT, 'knowledge', 'integrated')
  },
  monitoring: {
    enabled: true,
    metricsInterval: 30000 // 30秒
  }
};

class IntegrationOrchestrator {
  constructor() {
    this.bridges = new Map();
    this.systems = new Map();
    this.integrationStatus = 'initializing';
  }

  async start() {
    console.log('🚀 启动多智能体系统整合...');
    
    // 1. 初始化交易系统桥接
    console.log('📦 加载交易系统桥接...');
    const contractBridge = new ContractBridge(CONFIG.contractTrading);
    this.bridges.set('contract-trading', contractBridge);
    
    // 2. 初始化知识库桥接
    console.log('📚 加载知识库桥接...');
    const knowledgeBridge = new KnowledgeBridge(CONFIG.knowledge);
    this.bridges.set('knowledge', knowledgeBridge);
    
    // 3. 初始化监控桥接
    console.log('📊 加载监控桥接...');
    const monitoringBridge = new MonitoringBridge(CONFIG.monitoring);
    this.bridges.set('monitoring', monitoringBridge);
    
    // 4. 连接到Event Bus
    console.log('🔗 连接到Event Bus...');
    await this.connectToEventBus();
    
    // 5. 启动统计报告
    this.startStatsReporter();
    
    this.integrationStatus = 'running';
    console.log('✅ 系统整合完成！等待消息...');
  }

  async connectToEventBus() {
    const WebSocket = require('ws');
    
    return new Promise((resolve, reject) => {
      const ws = new WebSocket(EVENT_BUS_URL);
      
      ws.on('open', () => {
        console.log('✅ 已连接到Event Bus');
        this.eventBus = ws;
        this.setupMessageHandlers();
        resolve();
      });
      
      ws.on('error', (err) => {
        console.error('❌ Event Bus连接错误:', err.message);
        reject(err);
      });
      
      ws.on('close', () => {
        console.log('🔌 Event Bus连接关闭，5秒后重连...');
        setTimeout(() => this.connectToEventBus(), 5000);
      });
    });
  }

  setupMessageHandlers() {
    this.eventBus.on('message', async (data) => {
      try {
        const msg = JSON.parse(data);
        await this.routeMessage(msg);
      } catch (err) {
        console.error('[Orchestrator] 消息路由失败:', err.message);
      }
    });
  }

  async routeMessage(msg) {
    // 根据消息类型路由到对应的桥接器
    const targetSystem = this.determineTargetSystem(msg);
    
    if (targetSystem && this.bridges.has(targetSystem)) {
      const bridge = this.bridges.get(targetSystem);
      try {
        const result = await bridge.handleMessage(msg);
        this.emit('message_processed', { system: targetSystem, result, message: msg });
      } catch (err) {
        console.error(`[Orchestrator] ${targetSystem}处理失败:`, err.message);
      }
    } else {
      // 默认广播给所有桥接器
      for (const [name, bridge] of this.bridges) {
        try {
          await bridge.handleMessage(msg);
        } catch (err) {
          console.error(`[Orchestrator] ${name}处理失败:`, err.message);
        }
      }
    }
  }

  determineTargetSystem(msg) {
    // 根据消息内容判断目标系统
    if (msg.content && (msg.content.action || msg.content.signal)) {
      return 'contract-trading';
    }
    if (msg.content && (msg.content.learning || msg.content.knowledge)) {
      return 'knowledge';
    }
    if (msg.content && (msg.content.metrics || msg.content.health)) {
      return 'monitoring';
    }
    return null; // null表示广播到所有系统
  }

  startStatsReporter() {
    setInterval(() => {
      this.reportIntegrationStats();
    }, 60000); // 每分钟报告
  }

  reportIntegrationStats() {
    console.log('\n========== 📊 系统整合状态报告 ==========');
    console.log(`时间: ${new Date().toISOString()}`);
    console.log(`整合状态: ${this.integrationStatus}`);
    
    for (const [name, bridge] of this.bridges) {
      if (bridge.getStats) {
        const stats = bridge.getStats();
        console.log(`\n【${name}】`);
        console.log(`  状态: 运行中`);
        Object.entries(stats).forEach(([k, v]) => {
          console.log(`  ${k}: ${v}`);
        });
      }
    }
    
    console.log('=============================================\n');
  }

  shutdown() {
    console.log('🛑 正在关闭系统整合...');
    this.integrationStatus = 'shutting_down';
    if (this.eventBus) this.eventBus.close();
    process.exit(0);
  }
}

// 启动
if (require.main === module) {
  const orchestrator = new IntegrationOrchestrator();
  
  // 信号处理
  process.on('SIGINT', () => orchestrator.shutdown());
  process.on('SIGTERM', () => orchestrator.shutdown());
  
  orchestrator.start().catch(console.error);
}

module.exports = IntegrationOrchestrator;
