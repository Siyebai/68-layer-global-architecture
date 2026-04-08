#!/usr/bin/env node
/**
 * 智能体WebSocket客户端 - 统一启动器
 * 每个李白运行此脚本连接到Event Bus
 *
 * 用法: AGENT_ID=c-libai node scripts/agent-client.js
 */

const WebSocket = require('ws');
const fs = require('fs');
const path = require('path');

const PORT = process.env.EVENT_BUS_PORT || 19958;
const AGENT_ID = process.env.AGENT_ID;

if (!AGENT_ID) {
  console.error('❌ 请设置 AGENT_ID 环境变量 (例如: AGENT_ID=c-libai)');
  process.exit(1);
}

const configPath = path.join(__dirname, '..', 'config', `agent-${AGENT_ID}.js`);
if (!fs.existsSync(configPath)) {
  console.error(`❌ 配置文件不存在: ${configPath}`);
  process.exit(1);
}

const config = require(configPath);
const STATE_FILE = path.join(__dirname, '..', 'communication', 'state.json');

console.log(`🚀 [${AGENT_ID}] 智能体客户端启动...`);
console.log(`   Platform: ${config.platform}`);
console.log(`   Role: ${config.role}`);
console.log(`   Event Bus: ws://localhost:${PORT}`);

let ws;
let reconnectTimeout;
let messageCount = 0;

function updateState(status = 'online') {
  try {
    const state = JSON.parse(fs.readFileSync(STATE_FILE, 'utf8'));
    state.agents[AGENT_ID] = {
      status,
      lastSeen: new Date().toISOString(),
      platform: config.platform,
      role: config.role,
      health: { latency: 0, uptime: 100 }
    };
    fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2));
    console.log(`[${AGENT_ID}] ✅ 状态已更新: ${status}`);
  } catch (err) {
    console.error(`[${AGENT_ID}] ❌ 状态更新失败:`, err.message);
  }
}

function connect() {
  ws = new WebSocket(`ws://localhost:${PORT}/?agentId=${AGENT_ID}`);

  ws.on('open', () => {
    console.log(`[${AGENT_ID}] ✅ 已连接到Event Bus`);
    updateState('online');
    clearTimeout(reconnectTimeout);

    // 心跳: 每30秒发送ping
    setInterval(() => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.ping();
      }
    }, 30000);
  });

  ws.on('message', (data) => {
    try {
      const msg = JSON.parse(data);
      messageCount++;

      switch (msg.type) {
        case 'welcome':
          console.log(`[${AGENT_ID}] 👋 收到欢迎消息`);
          break;

        case 'batch':
          console.log(`[${AGENT_ID}] 📦 收到批量消息: ${msg.messages?.length || 0} 条`);
          msg.messages?.forEach(m => processMessage(m));
          break;

        case 'message':
          processMessage(msg.message);
          break;

        case 'ack':
          console.log(`[${AGENT_ID}] ✓ 消息已确认: ${msg.messageId}`);
          break;

        default:
          console.log(`[${AGENT_ID}] 📨 收到 ${msg.type} 消息`);
      }
    } catch (err) {
      console.error(`[${AGENT_ID}] ❌ 消息解析失败:`, err.message);
    }
  });

  ws.on('close', (code, reason) => {
    console.log(`[${AGENT_ID}] 🔌 连接关闭 (code: ${code})`);
    updateState('offline');
    scheduleReconnect();
  });

  ws.on('error', (err) => {
    console.error(`[${AGENT_ID}] ❌ 连接错误:`, err.message);
  });
}

function processMessage(msg) {
  const isToMe = msg.to === AGENT_ID || msg.to === 'all';
  const isFromMe = msg.from === AGENT_ID;
  const isReply = !!msg.replyTo;

  console.log(`[${AGENT_ID}] 📨 ${msg.from} → ${msg.to}: ${msg.subject}`);

  // 只处理发给自己的或广播的消息
  if (!isToMe) return;

  // 不回复自己的消息，也不回复已回复过的消息
  if (isFromMe || isReply) {
    return;
  }

  // 自动回复
  const reply = {
    to: msg.from,
    type: 'response',
    subject: `[REPLY] Re: ${msg.subject}`,
    content: {
      received: true,
      originalSubject: msg.subject,
      agent: AGENT_ID,
      timestamp: new Date().toISOString(),
      messageCount: messageCount
    },
    from: AGENT_ID,
    replyTo: msg.id
  };

  if (ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(reply));
    console.log(`[${AGENT_ID}] ↩️  已回复 ${msg.from}`);
  }
}

function scheduleReconnect() {
  if (reconnectTimeout) return;
  reconnectTimeout = setTimeout(() => {
    console.log(`[${AGENT_ID}] 🔄 尝试重连...`);
    connect();
  }, 5000);
}

function shutdown() {
  console.log(`[${AGENT_ID}] 🛑 正在关闭...`);
  updateState('offline');
  if (ws) ws.close();
  process.exit(0);
}

// 信号处理
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

// 启动连接
connect();

// 每60秒更新一次心跳
setInterval(() => {
  if (ws.readyState === WebSocket.OPEN) {
    updateState('online');
  }
}, 60000);
