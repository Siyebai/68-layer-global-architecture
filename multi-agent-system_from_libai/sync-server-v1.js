/**
 * 🔄 多端实时同步服务 V1.0
 * C李白总设计师方案 | 本地李白实现
 * 
 * 当前实现: 本地 Node.js WebSocket同步服务
 * 用途: 四李白间数据同步
 * PORT: 19969
 * 
 * 2026-03-28 | 本地李白
 */

'use strict';

const http = require('http');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const EventEmitter = require('events');

// ===== 数据模型统一标准 =====
const DataTypes = {
  TRADING: 'trading',      // 交易数据: Parquet格式
  CONFIG: 'config',        // 配置数据: JSON+版本控制
  KNOWLEDGE: 'knowledge',  // 知识数据: Markdown+YAML
  STATUS: 'status',        // 状态数据: Protobuf/1s更新
};

const Priority = {
  REALTIME: ['trading', 'status'],
  NEAR_REALTIME: ['config', 'knowledge'],
};

// ===== 同步数据包 =====
class SyncPacket {
  constructor(type, data, source, version = null) {
    this.id = crypto.randomUUID();
    this.type = type;
    this.data = data;
    this.source = source;
    this.version = version || Date.now().toString(36);
    this.timestamp = Date.now();
    this.checksum = this.computeChecksum();
  }

  computeChecksum() {
    return crypto
      .createHash('md5')
      .update(JSON.stringify(this.data) + this.version)
      .digest('hex')
      .slice(0, 8);
  }

  isValid() {
    return this.computeChecksum() === this.checksum;
  }
}

// ===== 冲突解决器 =====
class ConflictResolver {
  // 最后写入优先 (LWW)
  static resolveLastWriteWins(existing, incoming) {
    return incoming.timestamp > existing.timestamp ? incoming : existing;
  }

  // 向量时钟比较
  static compareVectorClocks(vc1, vc2) {
    let concurrent = false;
    let dominated = true;

    for (const key of new Set([...Object.keys(vc1), ...Object.keys(vc2)])) {
      const v1 = vc1[key] || 0;
      const v2 = vc2[key] || 0;
      if (v2 > v1) dominated = false;
      if (v1 !== v2) concurrent = true;
    }

    if (!concurrent) return 'SAME';
    return dominated ? 'VC1_WINS' : 'CONCURRENT';
  }

  // 自动合并策略
  static autoMerge(existing, incoming, strategy = 'LWW') {
    if (strategy === 'LWW') {
      return this.resolveLastWriteWins(existing, incoming);
    }
    // 可扩展其他策略
    return incoming;
  }
}

// ===== 同步服务器核心 =====
class SyncServer extends EventEmitter {
  constructor() {
    super();
    this.clients = new Map();     // clientId -> { ws, type, lastSeen }
    this.dataStore = new Map();   // key -> { packet, vectorClock }
    this.vectorClocks = {};       // nodeId -> counter
    this.pendingUpdates = [];
    this.port = 19969;
    this.server = null;
    this.stats = {
      totalSyncs: 0,
      conflicts: 0,
      broadcasts: 0,
    };
  }

  // 注册客户端
  registerClient(clientId, type) {
    this.clients.set(clientId, {
      id: clientId,
      type,
      lastSeen: Date.now(),
      vectorClock: {},
    });
    console.log(`[SyncServer] ${clientId}(${type}) 连接 | 总连接:${this.clients.size}`);
  }

  // 处理同步请求
  handleSyncRequest(clientId, packet) {
    const { type, data, version } = packet;
    const key = `${type}:${data.key || 'default'}`;

    const existing = this.dataStore.get(key);

    if (!existing) {
      // 新数据直接存
      this.dataStore.set(key, { packet, ts: Date.now() });
      this.broadcastUpdate(packet, clientId);
    } else {
      // 冲突解决
      const resolved = ConflictResolver.autoMerge(existing.packet, packet, 'LWW');
      if (resolved.id !== existing.packet.id) {
        // incoming赢了
        this.dataStore.set(key, { packet: resolved, ts: Date.now() });
        this.stats.conflicts++;
        this.broadcastUpdate(resolved, clientId);
      }
    }

    this.stats.totalSyncs++;
  }

  // 广播更新给其他客户端
  broadcastUpdate(packet, sourceClientId) {
    let sent = 0;
    this.clients.forEach((client, clientId) => {
      if (clientId !== sourceClientId && client.ws) {
        try {
          client.ws.send(JSON.stringify({
            type: 'DATA_UPDATE',
            packet,
            from: sourceClientId,
          }));
          sent++;
        } catch (e) {}
      }
    });
    this.stats.broadcasts++;
    return sent;
  }

  // 全量同步 (新客户端连接时)
  fullSync(clientId) {
    const client = this.clients.get(clientId);
    if (!client || !client.ws) return;

    const allData = Array.from(this.dataStore.values()).map(v => v.packet);
    client.ws.send(JSON.stringify({
      type: 'FULL_SYNC',
      data: allData,
      timestamp: Date.now(),
    }));
  }

  // 状态快照
  getStatus() {
    return {
      ok: true,
      service: 'sync-server-v1',
      port: this.port,
      clients: this.clients.size,
      dataKeys: this.dataStore.size,
      stats: this.stats,
      uptime: process.uptime(),
    };
  }

  // 启动HTTP服务 (WebSocket升级端点)
  startServer() {
    this.server = http.createServer((req, res) => {
      const url = req.url || '/';

      if (url === '/health') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(this.getStatus()));
      } else if (url === '/data') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        const snapshot = {};
        this.dataStore.forEach((v, k) => { snapshot[k] = v.packet; });
        res.end(JSON.stringify(snapshot));
      } else if (req.method === 'POST' && url === '/sync') {
        let body = '';
        req.on('data', c => body += c);
        req.on('end', () => {
          try {
            const packet = JSON.parse(body);
            this.handleSyncRequest('http-client', packet);
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ ok: true, id: packet.id }));
          } catch (e) {
            res.writeHead(400, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: e.message }));
          }
        });
      } else {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          service: 'sync-server-v1',
          endpoints: ['/health', '/data', 'POST /sync'],
        }));
      }
    });

    this.server.listen(this.port, () => {
      console.log(`[SyncServer V1] 启动 PORT:${this.port}`);
    });
  }

  stop() {
    if (this.server) this.server.close();
  }
}

// ===== 同步客户端 (本端使用) =====
class SyncClient {
  constructor(serverUrl = 'http://127.0.0.1:19969') {
    this.serverUrl = serverUrl;
    this.localCache = new Map();
  }

  // 推送数据
  async push(type, key, data) {
    const packet = new SyncPacket(type, { key, ...data }, 'libai-local');
    try {
      const res = await fetch(`${this.serverUrl}/sync`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(packet),
      });
      return await res.json();
    } catch (e) {
      return { error: e.message };
    }
  }

  // 拉取全量
  async pull() {
    try {
      const res = await fetch(`${this.serverUrl}/data`);
      const data = await res.json();
      Object.entries(data).forEach(([k, v]) => this.localCache.set(k, v));
      return data;
    } catch (e) {
      return { error: e.message };
    }
  }
}

module.exports = { SyncServer, SyncClient, SyncPacket, ConflictResolver, DataTypes };

if (require.main === module) {
  const server = new SyncServer();
  server.startServer();

  // 初始化: 同步当前持仓数据
  setTimeout(() => {
    const initPacket = new SyncPacket(
      DataTypes.TRADING,
      {
        key: 'positions',
        JTO: { gate: 17, bg: -17, delta: 0 },
        SUPER: { gate: -44, bg: 44, delta: 0 },
        timestamp: Date.now(),
      },
      'libai-local'
    );
    server.handleSyncRequest('init', initPacket);
    console.log('[SyncServer] 初始持仓数据已同步');
  }, 500);

  console.log('[SyncServer] 就绪 — C李白同步系统已启动');
  process.on('SIGTERM', () => server.stop());
  process.on('SIGINT', () => { server.stop(); process.exit(0); });
}
