#!/usr/bin/env node

/**
 * 多智能体通信系统测试
 * 测试Event Bus和消息传递功能
 */

const WebSocket = require('ws');
const http = require('http');

const EVENT_BUS_PORT = 19958;

async function testHttpApi() {
  console.log('🔍 测试HTTP API...');

  // 测试健康检查
  const health = await fetchJson(`http://localhost:${EVENT_BUS_PORT}/health`);
  console.log('Health:', health);

  // 测试状态查询
  const status = await fetchJson(`http://localhost:${EVENT_BUS_PORT}/status`);
  console.log('Status clients:', Object.keys(status).length);

  // 测试消息查询
  const messages = await fetchJson(`http://localhost:${EVENT_BUS_PORT}/messages`);
  console.log('Unread messages:', messages.unread?.length || 0);
}

function fetchJson(url) {
  return new Promise((resolve, reject) => {
    http.get(url, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          resolve(JSON.parse(data));
        } catch (e) {
          reject(e);
        }
      });
    }).on('error', reject);
  });
}

async function testWebSocket() {
  console.log('\n🔌 测试WebSocket连接...');

  return new Promise((resolve) => {
    const ws = new WebSocket(`ws://localhost:${EVENT_BUS_PORT}/?agentId=test-sender`);

    ws.on('open', () => {
      console.log('✅ WebSocket连接已建立');

      // 发送测试消息
      const testMsg = {
        to: 'all',
        type: 'broadcast',
        subject: '[TEST] 通信系统测试',
        content: {
          test: true,
          timestamp: new Date().toISOString(),
          message: '这是一条测试消息，如果收到请回复'
        },
        from: 'test-sender'
      };

      ws.send(JSON.stringify(testMsg));
      console.log('📤 已发送广播消息:', testMsg.subject);
    });

    ws.on('message', (data) => {
      try {
        const msg = JSON.parse(data);
        console.log('📥 收到WebSocket消息:', msg.type, msg.content);

        if (msg.type === 'message') {
          console.log('  → 来自:', msg.message.from);
          console.log('  → 内容:', msg.message.content);

          // 自动回复
          if (msg.message.from !== 'test-sender') {
            const reply = {
              to: msg.message.from,
              type: 'response',
              subject: '[REPLY] 已收到测试消息',
              content: { received: true, originalId: msg.message.id },
              from: 'test-sender',
              replyTo: msg.message.id
            };
            ws.send(JSON.stringify(reply));
            console.log('📤 已发送回复');
          }
        }
      } catch (e) {
        console.error('解析消息失败:', e.message);
      }
    });

    ws.on('close', () => {
      console.log('🔌 WebSocket连接已关闭');
      resolve();
    });

    ws.on('error', (err) => {
      console.error('❌ WebSocket错误:', err.message);
      resolve();
    });

    // 10秒后关闭测试
    setTimeout(() => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.close();
      }
      resolve();
    }, 10000);
  });
}

async function runTests() {
  console.log('🧪 开始多智能体通信系统测试');
  console.log('=' .repeat(50));

  try {
    await testHttpApi();
    await testWebSocket();

    console.log('\n' + '='.repeat(50));
    console.log('✅ 测试完成');
  } catch (err) {
    console.error('❌ 测试失败:', err.message);
  }
}

runTests();