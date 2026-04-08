#!/usr/bin/env node

/**
 * 智能体启动器
 * 用法: node start-agent.js <agent-id>
 * 示例: node start-agent.js c-libai
 */

const { spawn } = require('child_process');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const AGENT_ID = process.argv[2];

if (!AGENT_ID) {
  console.error('❌ 请指定Agent ID');
  console.error('用法: node start-agent.js <agent-id>');
  console.error('可用ID: c-libai, q-libai, cloud-libai, bai-juyi, du-fu');
  process.exit(1);
}

const configFile = path.join(ROOT, 'config', `agent-${AGENT_ID}.js`);
if (!require('fs').existsSync(configFile)) {
  console.error(`❌ 配置文件不存在: ${configFile}`);
  console.error('请先复制 agent-example.js 并修改为你自己的配置');
  process.exit(1);
}

console.log(`🚀 启动Agent: ${AGENT_ID}`);

// 设置环境变量
process.env.AGENT_ID = AGENT_ID;

// 启动主系统（包含通信模块）
const child = spawn('node', ['scripts/ultimate-v24-autonomous.js', '--with-communication'], {
  cwd: ROOT,
  stdio: 'inherit',
  detached: false
});

child.on('exit', (code) => {
  console.log(`📊 Agent ${AGENT_ID} 退出，代码: ${code}`);
});

child.on('error', (err) => {
  console.error(`❌ 启动失败: ${err.message}`);
});

// 处理信号
process.on('SIGINT', () => {
  console.log('\n🛑 正在停止Agent...');
  child.kill('SIGINT');
});