#!/usr/bin/env node
/**
 * 系统协调器 - 核心管理后台
 * 提供Agent注册、健康检查、消息传递、状态同步功能
 */

const http = require('http');
const WebSocket = require('ws');
const fs = require('fs');
const path = require('path');

const PORT = process.env.COORDINATOR_PORT || 19963;
const STATE_FILE = process.env.STATE_FILE || path.join(__dirname, '../communication/state.json');
const EVENT_BUS_URL = process.env.EVENT_BUS_URL || 'ws://localhost:19958';

class SystemCoordinator {
  constructor() {
    this.agents = new Map();
    this.httpServer = null;
    this.wss = null;
    this.state = this.loadState();
    this.healthCheckInterval = null;
    this.lockFile = null;
  }

  // 加锁文件以防止多实例冲突
  acquireLock() {
    const lockPath = this.stateFile + '.lock';
    if (fs.existsSync(lockPath)) {
      console.error(`[Coordinator] Lock file exists, another instance running?`);
      process.exit(1);
    }
    fs.writeFileSync(lockPath, Date.now().toString());
    this.lockFile = lockPath;
  }

  releaseLock() {
    if (this.lockFile && fs.existsSync(this.lockFile)) {
      fs.unlinkSync(this.lockFile);
    }
  }

  loadState() {
    try {
      if (fs.existsSync(STATE_FILE)) {
        const data = fs.readFileSync(STATE_FILE, 'utf8');
        return JSON.parse(data);
      }
    } catch (err) {
      console.error(`[Coordinator] Failed to load state:`, err.message);
    }
    return { version: '2.0', agents: {} };
  }

  saveState() {
    try {
      this.state.lastSync = new Date().toISOString();
      fs.writeFileSync(STATE_FILE, JSON.stringify(this.state, null, 2));
    } catch (err) {
      console.error(`[Coordinator] Failed to save state:`, err.message);
    }
  }

  // HTTP API
  startHttpServer() {
    this.httpServer = http.createServer(async (req, res) => {
      res.setHeader('Content-Type', 'application/json');

      if (req.url === '/health') {
        res.writeHead(200);
        res.end(JSON.stringify({
          status: 'ok',
          port: PORT,
          eventBus: EVENT_BUS_URL,
          agents: this.agents.size,
          uptime: process.uptime()
        }));
      } else if (req.url === '/status') {
        res.writeHead(200);
        res.end(JSON.stringify(this.state));
      } else if (req.url === '/agents') {
        res.writeHead(200);
        res.end(JSON.stringify([...this.agents.values()]));
      } else {
        res.writeHead(404);
        res.end(JSON.stringify({ error: 'Not found' }));
      }
    });

    this.httpServer.listen(PORT, () => {
      console.log(`[Coordinator] HTTP server listening on ${PORT}`);
      console.log(`[Coordinator] Health: http://localhost:${PORT}/health`);
    });
  }

  // WebSocket Connection to Event Bus
  connectToEventBus() {
    console.log(`[Coordinator] Connecting to Event Bus at ${EVENT_BUS_URL}...`);
    const ws = new WebSocket(EVENT_BUS_URL);

    ws.on('open', () => {
      console.log(`[Coordinator] Connected to Event Bus`);

      // Register as coordinator
      ws.send(JSON.stringify({
        type: 'register',
        agentId: 'coordinator',
        role: 'coordinator',
        timestamp: new Date().toISOString()
      }));
    });

    ws.on('message', (data) => {
      try {
        const msg = JSON.parse(data);
        if (msg.type === 'message' || msg.type === 'batch') {
          console.log(`[Coordinator] Received ${msg.type} message`);
        }
      } catch (err) {
        // Ignore parse errors
      }
    });

    ws.on('close', () => {
      console.log(`[Coordinator] Event Bus connection lost, reconnecting in 5s...`);
      setTimeout(() => this.connectToEventBus(), 5000);
    });

    ws.on('error', (err) => {
      console.error(`[Coordinator] Event Bus error:`, err.message);
    });
  }

  // 定期健康检查
  startHealthCheck() {
    this.healthCheckInterval = setInterval(() => {
      this.checkAgentHealth();
      this.saveState();
    }, 5 * 60 * 1000); // 每5分钟
  }

  checkAgentHealth() {
    const now = Date.now();
    const thirtyMinutesAgo = now - 30 * 60 * 1000;

    this.state.agents = Object.fromEntries(
      Object.entries(this.state.agents)
        .filter(([id, info]) => {
          const lastSeen = new Date(info.lastSeen).getTime();
          if (lastSeen < thirtyMinutesAgo) {
            console.warn(`[Coordinator] Agent ${id} considered offline (last seen: ${info.lastSeen})`);
            return false;
          }
          return true;
        })
    );

    const onlineCount = Object.keys(this.state.agents).length;
    if (onlineCount < 5) {
      console.warn(`[Coordinator] ⚠️ 只有 ${onlineCount}/5 个Agent在线`);
    } else {
      console.log(`[Coordinator] ✅ 全部 ${onlineCount}/5 个Agent在线`);
    }
  }

  // 广播系统消息
  broadcast(message) {
    return new Promise((resolve, reject) => {
      const ws = new WebSocket(EVENT_BUS_URL);

      ws.on('open', () => {
        ws.send(JSON.stringify(message));
        resolve();
        ws.close();
      });

      ws.on('error', (err) => reject(err));
    });
  }

  start() {
    this.acquireLock();
    this.startHttpServer();
    this.startHealthCheck();
    this.connectToEventBus();

    // 优雅关闭
    process.on('SIGINT', () => {
      console.log('\n[Coordinator] Shutting down...');
      this.releaseLock();
      this.saveState();
      process.exit(0);
    });

    console.log(`[Coordinator] System ready`);
  }
}

// 启动
if (require.main === module) {
  const coordinator = new SystemCoordinator();
  coordinator.start();
}

module.exports = SystemCoordinator;
