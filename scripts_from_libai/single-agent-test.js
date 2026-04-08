#!/usr/bin/env node
/**
 * 单Agent广播测试 - 验证全系统通信
 * 用法: AGENT_ID=c-libai node scripts/single-agent-test.js
 */

const WebSocket = require('ws');

const PORT = process.env.EVENT_BUS_PORT || 19958;
const AGENT_ID = process.env.AGENT_ID || 'c-libai';

const ws = new WebSocket(`ws://localhost:${PORT}/?agentId=${AGENT_ID}`);

const receivedReplies = [];
let testComplete = false;

ws.on('open', () => {
  console.log(`[${AGENT_ID}] ✅ WebSocket已连接`);

  // 发送测试广播
  const testMsg = {
    to: 'all',
    type: 'broadcast',
    subject: '[SYSTEM-TEST] 全系统相互通信测试',
    content: {
      command: 'ping',
      timestamp: new Date().toISOString(),
      from: AGENT_ID
    },
    from: AGENT_ID
  };

  ws.send(JSON.stringify(testMsg));
  console.log(`[${AGENT_ID}] 📤 已发送广播: ${testMsg.subject}`);

  // 10秒后自动结束
  setTimeout(() => {
    if (!testComplete) {
      console.log(`\n[${AGENT_ID}] ⏰ 测试超时，收集结果...`);
      finishTest();
    }
  }, 10000);
});

ws.on('message', (data) => {
  try {
    const msg = JSON.parse(data);

    if (msg.type === 'welcome') {
      console.log(`[${AGENT_ID}] 收到欢迎消息`);
    } else if (msg.type === 'message') {
      // 只处理发给自己的消息
      if (msg.message.to === AGENT_ID || msg.message.to === 'all') {
        receivedReplies.push(msg.message);
        console.log(`[${AGENT_ID}] 📨 收到回复 from ${msg.message.from}: ${msg.message.subject}`);
      }
    } else if (msg.type === 'batch') {
      console.log(`[${AGENT_ID}] 收到批量消息: ${msg.messages?.length || 0} 条`);
    }
  } catch (e) {
    console.error(`[${AGENT_ID}] 消息解析错误:`, e.message);
  }
});

ws.on('close', () => {
  if (!testComplete) {
    console.log(`[${AGENT_ID}] 🔌 WebSocket连接关闭`);
    finishTest();
  }
});

ws.on('error', (err) => {
  console.error(`[${AGENT_ID}] ❌ 连接错误:`, err.message);
  finishTest();
});

function finishTest() {
  testComplete = true;
  console.log(`\n========== TEST RESULTS ==========`);
  console.log(`发送者: ${AGENT_ID}`);
  console.log(`收到回复数: ${receivedReplies.length}`);
  console.log(`回复列表:`);
  receivedReplies.forEach(r => {
    console.log(`  - ${r.from}: ${r.subject}`);
  });
  console.log(`==================================\n`);
  process.exit(0);
}
