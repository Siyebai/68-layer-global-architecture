#!/usr/bin/env node

/**
 * 智能体通信同步脚本
 * 自动执行：git pull → 启动Agent → 更新状态 → git push
 */

const { execSync } = require('child_process');
const path = require('path');
const fs = require('fs');

const ROOT = path.join(__dirname, '..');
const AGENT_ID = process.env.AGENT_ID || 'c-libai';

function log(msg, type = 'INFO') {
  const prefix = { INFO: '📡', SUCCESS: '✅', ERROR: '❌', WARN: '⚠️' }[type];
  console.log(`${prefix} ${msg}`);
}

function run(cmd, silent = false) {
  try {
    const output = execSync(cmd, { cwd: ROOT, encoding: 'utf-8', stdio: silent ? 'pipe' : 'inherit' });
    return { ok: true, output };
  } catch (err) {
    return { ok: false, error: err.message };
  }
}

// 1. 拉取最新状态
log('正在同步GitHub仓库...');
const pull = run('git pull origin master');
if (!pull.ok) {
  log(`Git拉取失败: ${pull.error}`, 'ERROR');
  process.exit(1);
}

// 2. 检查通信文件
const commDir = path.join(ROOT, 'communication');
const stateFile = path.join(commDir, 'state.json');

if (!fs.existsSync(commDir) || !fs.existsSync(stateFile)) {
  log('通信目录不完整，重新克隆...', 'WARN');
  run('git stash');
  run('git checkout -- communication/');
  run('git stash pop');
}

// 3. 更新状态为 online
log(`激活Agent状态: ${AGENT_ID}`);
const state = JSON.parse(fs.readFileSync(stateFile, 'utf8'));
state.version = '2.0';
state.lastSync = new Date().toISOString();
state.agents[AGENT_ID] = {
  status: 'online',
  lastSeen: new Date().toISOString(),
  platform: state.agents[AGENT_ID]?.platform || 'unknown',
  health: { latency: 0, uptime: 100 }
};

fs.writeFileSync(stateFile, JSON.stringify(state, null, 2));
log('状态文件已更新', 'SUCCESS');

// 4. 提交并推送
log('提交状态更新...');
run('git add communication/state.json');
run(`git commit -m "status: ${AGENT_ID} online at ${new Date().toISOString()}"`);
const push = run('git push origin master');

if (push.ok) {
  log('状态已同步到GitHub', 'SUCCESS');
} else {
  log(`Git推送失败: ${push.error}`, 'ERROR');
}

// 5. 启动Agent客户端
log(`启动Agent: ${AGENT_ID}`);
const agentConfig = path.join(ROOT, 'config', `agent-${AGENT_ID}.js`);
if (!fs.existsSync(agentConfig)) {
  log(`配置文件不存在: ${agentConfig}`, 'ERROR');
  process.exit(1);
}

// 使用 fork 启动 agent-client.js，保持进程运行
const { fork } = require('child_process');
const agentScript = path.join(ROOT, 'scripts', 'agent-client.js');

log('正在启动Agent WebSocket客户端...', 'INFO');
const agentProcess = fork(agentScript, [], {
  env: { ...process.env, AGENT_ID },
  stdio: 'inherit',
  detached: false
});

// 等待Agent连接成功后，脚本保持运行
agentProcess.on('exit', (code) => {
  log(`Agent进程退出 (code: ${code})`, code === 0 ? 'INFO' : 'ERROR');
  updateState('offline');
});

agentProcess.on('message', (msg) => {
  if (msg && msg[0] === 'READY') {
    log('通信系统就绪！Agent已启动并连接。', 'SUCCESS');
  }
});

// 保持主脚本运行
process.on('SIGINT', () => {
  log('收到终止信号，关闭Agent...', 'INFO');
  agentProcess.kill('SIGTERM');
  process.exit(0);
});

log('Monitor: http://localhost:19963/status', 'INFO');
log('Event Bus: http://localhost:19958/health', 'INFO');
log('Agent进程已启动，按 Ctrl+C 停止', 'INFO');

// 阻塞主进程
agentProcess.on('exit', () => process.exit(0));