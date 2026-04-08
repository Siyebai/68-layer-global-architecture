#!/usr/bin/env node

/**
 * 多智能体通信集成测试
 * 模拟多个李白Agent连接Event Bus并交换消息
 */

const WebSocket = require('ws');
const http = require('http');
const path = require('path');
const fs = require('fs');

const ROOT = path.join(__dirname, '..');
const EVENT_BUS_PORT = 19958;
const STATE_FILE = path.join(ROOT, 'communication', 'state.json');

// 模拟的李白Agent列表
const AGENTS = ['c-libai', 'q-libai', 'cloud-libai', 'bai-juyi', 'du-fu'];

function updateState(agentId, online = true) {
  const state = JSON.parse(fs.readFileSync(STATE_FILE, 'utf8'));
  state.version = '2.0';
  state.lastSync = new Date().toISOString();
  state.agents[agentId] = {
    status: online ? 'online' : 'offline',
    lastSeen: new Date().toISOString(),
    platform: getPlatform(agentId),
    health: { latency: Math.floor(Math.random() * 50), uptime: 99.8 }
  };
  fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2));
  console.log(`[${agentId}] 状态已更新: ${online ? 'online' : 'offline'}`);
}

function getPlatform(agentId) {
  const map = {
    'c-libai': 'Chatclaw',
    'q-libai': '微信',
    'cloud-libai': 'Telegram',
    'bai-juyi': '阶跃星辰云端',
    'du-fu': '阶跃星辰本地'
  };
  return map[agentId] || 'unknown';
}

async function waitForEventBus(maxAttempts = 10) {
  for (let i = 0; i < maxAttempts; i++) {
    try {
      const res = await fetchJson(`http://localhost:${EVENT_BUS_PORT}/health`);
      if (res.status === 'ok') {
        console.log('✅ Event Bus 已就绪');
        return true;
      }
    } catch (e) {
      await sleep(1000);
    }
  }
  return false;
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

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function runAgentSimulation(agentId) {
  return new Promise((resolve) => {
    console.log(`🚀 启动模拟Agent: ${agentId}`);

    // 更新状态为 online
    updateState(agentId, true);

    const ws = new WebSocket(`ws://localhost:${EVENT_BUS_PORT}/?agentId=${agentId}`);

    const receivedMessages = [];

    ws.on('open', () => {
      console.log(`  [${agentId}] WebSocket已连接`);

      // 如果是第一个Agent，发送一条广播消息
      if (agentId === 'c-libai') {
        setTimeout(() => {
          const msg = {
            to: 'all',
            type: 'broadcast',
            subject: '[SYSTEM] 多智能体通信测试开始',
            content: {
              initiator: 'c-libai',
              timestamp: new Date().toISOString(),
              message: '各位李白，通信系统测试现在开始，请回复确认收到'
            },
            from: 'c-libai'
          };
          ws.send(JSON.stringify(msg));
          console.log(`  [${agentId}] 已发送广播消息`);
        }, 1000);
      }
    });

    ws.on('message', (data) => {
      try {
        const msg = JSON.parse(data);

        if (msg.type === 'welcome') {
          console.log(`  [${agentId}] 收到欢迎消息`);
        } else if (msg.type === 'message') {
          // 只处理发给自己的消息或广播
          const target = msg.message.to;
          if (target !== agentId && target !== 'all') {
            return; // 不是发给我的，忽略
          }

          receivedMessages.push(msg.message);
          console.log(`  [${agentId}] 收到消息 from ${msg.message.from}: ${msg.message.subject}`);

          // 自动回复 (除非是自己发的，且消息不是回复)
          if (msg.message.from !== agentId && !msg.message.replyTo) {
            const reply = {
              to: msg.message.from,
              type: 'response',
              subject: `[REPLY] Re: ${msg.message.subject}`,
              content: {
                received: true,
                originalSubject: msg.message.subject,
                agent: agentId,
                timestamp: new Date().toISOString()
              },
              from: agentId,
              replyTo: msg.message.id
            };
            ws.send(JSON.stringify(reply));
            console.log(`  [${agentId}] 已回复 ${msg.message.from}`);
          }
        } else if (msg.type === 'ack') {
          console.log(`  [${agentId}] 消息已确认: ${msg.messageId}`);
        } else if (msg.type === 'batch') {
          console.log(`  [${agentId}] 收到批量消息: ${msg.messages?.length || 0} 条`);
        }
      } catch (e) {
        console.error(`  [${agentId}] 消息解析错误:`, e.message);
      }
    });

    ws.on('close', () => {
      console.log(`  [${agentId}] WebSocket已关闭`);
      updateState(agentId, false);
      resolve(receivedMessages);
    });

    ws.on('error', (err) => {
      console.error(`  [${agentId}] WebSocket错误:`, err.message);
    });

    // 30秒后自动关闭
    setTimeout(() => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.close();
      }
    }, 30000);
  });
}

async function runFullTest() {
  console.log('🧪 多智能体通信系统集成测试');
  console.log('=' .repeat(60));
  console.log('测试目标: 验证Event Bus + 状态同步 + 消息传递');
  console.log('参与Agent:', AGENTS.join(', '));
  console.log('=' .repeat(60));

  // 1. 检查Event Bus
  if (!(await waitForEventBus())) {
    console.error('❌ Event Bus 未就绪，测试终止');
    return;
  }

  // 2. 重置状态文件
  const initialState = {
    version: '2.0',
    lastSync: null,
    agents: {}
  };
  AGENTS.forEach(id => {
    initialState.agents[id] = {
      status: 'offline',
      lastSeen: null,
      platform: getPlatform(id)
    };
  });
  fs.writeFileSync(STATE_FILE, JSON.stringify(initialState, null, 2));
  console.log('📝 状态文件已重置');

  // 3. 并行启动所有Agent模拟
  console.log('\n🚀 启动所有Agent...');
  const results = await Promise.all(AGENTS.map(id => runAgentSimulation(id)));

  // 4. 汇总结果
  console.log('\n' + '='.repeat(60));
  console.log('📊 测试结果汇总:');

  let totalReceived = 0;
  results.forEach((msgs, idx) => {
    const agentId = AGENTS[idx];
    console.log(`  ${agentId}: 收到 ${msgs.length} 条消息`);
    totalReceived += msgs.length;
  });

  console.log(`\n总计收到消息: ${totalReceived} 条`);

  // 5. 检查最终状态
  const finalState = JSON.parse(fs.readFileSync(STATE_FILE, 'utf8'));
  const onlineCount = Object.values(finalState.agents).filter(a => a.status === 'online').length;
  console.log(`在线Agent: ${onlineCount}/${AGENTS.length}`);

  if (totalReceived > 0 && onlineCount === 0) {
    console.log('\n✅ 测试成功: 消息传递正常，状态更新正确');
  } else {
    console.log('\n⚠️  测试完成，但有些异常');
  }

  console.log('='.repeat(60));
}

runFullTest().catch(console.error);