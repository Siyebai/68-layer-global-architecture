/**
 * V72MultiAgentCoordinator - 为V7.2封装multi-agent-system协调器
 * 将五层架构的周期调度转换为事件驱动
 */

const { EventEmitter } = require('events');
const path = require('path');

class V72MultiAgentCoordinator extends EventEmitter {
  constructor(v72System) {
    super();
    this.v72System = v72System;
    this.multiAgentDir = path.join(__dirname, '..', '..', 'multi-agent-system');
    this.agents = {};
    this.eventBus = null;
    this.coordinator = null;
    this.running = false;
  }

  async initialize() {
    console.log('[V7.2Coordinator] 初始化多智能体协调器...');

    try {
      // 动态加载multi-agent-system组件
      const agentRegistry = require(this.multiAgentDir + '/agent-registry');
      const eventBus = require(this.multiAgentDir + '/event-bus-v2');
      const coordinator = require(this.multiAgentDir + '/multi-agent-coordinator-v2');

      // 初始化事件总线
      this.eventBus = new eventBus();
      await this.eventBus.start();
      console.log('[V7.2Coordinator] ✅ 事件总线已启动');

      // 初始化协调器
      this.coordinator = new coordinator({
        eventBus: this.eventBus,
        agentRegistry: agentRegistry
      });
      await this.coordinator.start();
      console.log('[V7.2Coordinator] ✅ 协调器已启动');

      // 注册V7.2五层为智能体
      this.registerV72LayersAsAgents();

      // 设置事件监听
      this.setupEventListeners();

      console.log('[V7.2Coordinator] 多智能体协调器初始化完成');
      return true;
    } catch (e) {
      console.error('[V7.2Coordinator] ❌ 初始化失败:', e.message);
      throw e;
    }
  }

  // 将V7.2五层注册为智能体
  registerV72LayersAsAgents() {
    const layers = [
      { id: 'perception', name: '感知层', interval: 30000 },
      { id: 'cognition', name: '认知层', interval: 60000 },
      { id: 'action', name: '行动层', interval: 180000 },
      { id: 'learning', name: '学习层', interval: 300000 },
      { id: 'evolution', name: '进化层', interval: 1800000 }
    ];

    for (const layer of layers) {
      this.eventBus.publish('agent:register', {
        agentId: layer.id,
        name: layer.name,
        type: 'v7-layer',
        capabilities: [layer.id],
        heartbeatInterval: layer.interval
      });
      console.log(`[V7.2Coordinator] 注册智能体: ${layer.name} (${layer.id})`);
    }
  }

  // 设置事件监听，桥接V7.2和多智能体系统
  setupEventListeners() {
    // 监听五层事件，转发到事件总线
    this.v72System.on('perception:cycle', (data) => {
      this.eventBus.publish('perception:completed', {
        layer: 'perception',
        timestamp: Date.now(),
        data: data
      });
    });

    this.v72System.on('cognition:cycle', (data) => {
      this.eventBus.publish('cognition:completed', {
        layer: 'cognition',
        timestamp: Date.now(),
        data: data
      });
    });

    this.v72System.on('action:cycle', (data) => {
      this.eventBus.publish('action:completed', {
        layer: 'action',
        timestamp: Date.now(),
        data: data
      });
    });

    this.v72System.on('learning:cycle', (data) => {
      this.eventBus.publish('learning:completed', {
        layer: 'learning',
        timestamp: Date.now(),
        data: data
      });
    });

    this.v72System.on('evolution:cycle', (data) => {
      this.eventBus.publish('evolution:completed', {
        layer: 'evolution',
        timestamp: Date.now(),
        data: data
      });
    });

    // 监听其他智能体的事件
    this.eventBus.subscribe('signal:technical', (msg) => {
      this.emit('signalReceived', msg.payload);
    });

    this.eventBus.subscribe('decision:approval', (msg) => {
      this.emit('decisionApproved', msg.payload);
    });

    this.eventBus.subscribe('alert:system', (msg) => {
      this.emit('systemAlert', msg.payload);
    });

    console.log('[V7.2Coordinator] 事件监听已设置');
  }

  // 启动协调器
  async start() {
    console.log('[V7.2Coordinator] 启动多智能体协调...');
    this.running = true;

    // 启动五层的周期调度 (保留原逻辑，但改为事件触发)
    this.scheduleLayerCycles();

    console.log('[V7.2Coordinator] ✅ 多智能体协调器已启动');
    return true;
  }

  // 调度五层周期 (改为事件触发而非setInterval)
  scheduleLayerCycles() {
    // 感知层: 30秒
    setInterval(() => {
      if (this.running) {
        this.v72System.perceptionCycle()
          .then(result => this.emit('perceptionCycle', result))
          .catch(e => console.error('[V7.2Coordinator] 感知层错误:', e));
      }
    }, 30000);

    // 认知层: 1分钟
    setInterval(() => {
      if (this.running) {
        this.v72System.cognitionCycle()
          .then(result => this.emit('cognitionCycle', result))
          .catch(e => console.error('[V7.2Coordinator] 认知层错误:', e));
      }
    }, 60000);

    // 行动层: 3分钟
    setInterval(() => {
      if (this.running) {
        this.v72System.actionCycle()
          .then(result => this.emit('actionCycle', result))
          .catch(e => console.error('[V7.2Coordinator] 行动层错误:', e));
      }
    }, 180000);

    // 学习层: 5分钟
    setInterval(() => {
      if (this.running) {
        this.v72System.learningCycle()
          .then(result => this.emit('learningCycle', result))
          .catch(e => console.error('[V7.2Coordinator] 学习层错误:', e));
      }
    }, 300000);

    // 进化层: 30分钟
    setInterval(() => {
      if (this.running) {
        this.v72System.evolutionCycle()
          .then(result => this.emit('evolutionCycle', result))
          .catch(e => console.error('[V7.2Coordinator] 进化层错误:', e));
      }
    }, 1800000);

    console.log('[V7.2Coordinator] 五层周期调度已设置');
  }

  // 停止协调器
  async stop() {
    console.log('[V7.2Coordinator] 停止多智能体协调器...');
    this.running = false;

    if (this.coordinator) {
      await this.coordinator.stop();
    }
    if (this.eventBus) {
      await this.eventBus.stop();
    }

    console.log('[V7.2Coordinator] ✅ 已停止');
    return true;
  }

  // 获取状态
  getStatus() {
    return {
      running: this.running,
      eventBus: this.eventBus ? this.eventBus.getStatus() : { connected: false },
      coordinator: this.coordinator ? this.coordinator.getStatus() : { active: false },
      layers: {
        perception: { scheduled: true, interval: '30s' },
        cognition: { scheduled: true, interval: '1m' },
        action: { scheduled: true, interval: '3m' },
        learning: { scheduled: true, interval: '5m' },
        evolution: { scheduled: true, interval: '30m' }
      }
    };
  }
}

module.exports = V72MultiAgentCoordinator;

