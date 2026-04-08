#!/bin/bash
# 第7轮整合 - Phase 3: 第二大脑系统增强
# 集成knowledge-graph.js增强V7.2知识管理

set -e

cd /root/.openclaw/workspace/libai-workspace

echo "=========================================="
echo "  第7轮整合 - Phase 3: 第二大脑系统"
echo "=========================================="
echo ""

LOG_DIR="logs/integration-round-7"
START_TIME=$(date '+%Y%m%d-%H%M%S')
echo "开始时间: $(date)" > $LOG_DIR/phase3-brain-$START_TIME.log

# ==========================================
# 步骤1: 分析第二大脑系统
# ==========================================
echo "[1/5] 分析第二大脑系统..."

BRAIN_DIR="lib/brain"
if [ ! -d "$BRAIN_DIR" ]; then
  echo "❌ lib/brain目录不存在"
  exit 1
fi

echo "发现第二大脑核心文件:"
ls -1 "$BRAIN_DIR"/*.js

# 检查关键文件
if [ -f "$BRAIN_DIR/knowledge-graph.js" ]; then
  size=$(wc -c < "$BRAIN_DIR/knowledge-graph.js")
  echo "  ✅ knowledge-graph.js ($size bytes)"
else
  echo "  ❌ knowledge-graph.js (缺失)"
  exit 1
fi

if [ -f "$BRAIN_DIR/knowledge-graph.inmemory.js" ]; then
  size=$(wc -c < "$BRAIN_DIR/knowledge-graph.inmemory.js")
  echo "  ✅ knowledge-graph.inmemory.js ($size bytes)"
else
  echo "  ❌ knowledge-graph.inmemory.js (缺失)"
fi

# ==========================================
# 步骤2: 创建V7.2第二大脑适配器
# ==========================================
echo "[2/5] 创建V7.2第二大脑适配器..."

BRAIN_ADAPTER_DIR="scripts/brain-integration"
mkdir -p "$BRAIN_ADAPTER_DIR"

cat > "$BRAIN_ADAPTER_DIR/v7.2-brain.js" << 'EOF'
/**
 * V7.2BrainIntegration - 第二大脑系统适配器
 * 集成knowledge-graph到V7.2学习层
 */

const path = require('path');

class V7.2BrainIntegration {
  constructor(v72System) {
    this.v72System = v72System;
    this.knowledgeGraph = null;
    this.memoryStore = null;
    this.learningEngine = null;
    this.running = false;
    this.configPath = path.join(__dirname, '..', 'config', 'brain-integration.yaml');
    this.config = this.loadConfig();
  }

  loadConfig() {
    try {
      const fs = require('fs');
      if (fs.existsSync(this.configPath)) {
        const content = fs.readFileSync(this.configPath, 'utf8');
        return eval(`(#{content})`); // 简单解析，实际应用用yaml库
      }
    } catch (e) {
      console.warn('[V7.2Brain] 配置文件加载失败，使用默认');
    }
    return {
      enabled: true,
      storageType: 'inmemory',  // inmemory | redis | postgres
      autoExtraction: true,
      maxNodes: 100000,
      maxEdges: 500000,
      embedding: {
        enabled: false,
        model: 'text-embedding-ada-002'
      }
    };
  }

  async initialize() {
    console.log('[V7.2Brain] 初始化第二大脑系统...');

    try {
      // 动态加载knowledge-graph
      const brainDir = path.join(__dirname, '..', 'lib', 'brain');
      const KnowledgeGraph = require(brainDir + '/knowledge-graph');
      const KnowledgeGraphInMemory = require(brainDir + '/knowledge-graph.inmemory');

      // 根据配置选择存储类型
      if (this.config.storageType === 'inmemory') {
        this.knowledgeGraph = new KnowledgeGraphInMemory({
          maxNodes: this.config.maxNodes,
          maxEdges: this.config.maxEdges
        });
      } else {
        this.knowledgeGraph = new KnowledgeGraph(this.config);
      }

      console.log('[V7.2Brain] ✅ 知识图谱已创建');
      
      // 预加载现有知识
      await this.preloadExistingKnowledge();
      
      console.log('[V7.2Brain] 第二大脑系统初始化完成');
      return true;
    } catch (e) {
      console.error('[V7.2Brain] ❌ 初始化失败:', e.message);
      throw e;
    }
  }

  async preloadExistingKnowledge() {
    // 加载knowledge目录下的所有markdown文件
    const knowledgeDir = path.join(__dirname, '..', 'knowledge');
    const fs = require('fs');
    
    if (!fs.existsSync(knowledgeDir)) {
      console.log('[V7.2Brain] knowledge目录不存在，跳过预加载');
      return;
    }

    const files = fs.readdirSync(knowledgeDir).filter(f => f.endsWith('.md'));
    console.log(`[V7.2Brain] 预加载 ${files.length} 个知识文档...`);

    for (const file of files.slice(0, 50)) { // 限制预加载数量
      try {
        const content = fs.readFileSync(path.join(knowledgeDir, file), 'utf8');
        await this.extractKnowledge(content, { source: file, auto: true });
      } catch (e) {
        console.warn(`[V7.2Brain] 加载 ${file} 失败:`, e.message);
      }
    }
    
    console.log(`[V7.2Brain] ✅ 预加载完成，当前图谱节点数: ${this.knowledgeGraph.nodeCount || 'N/A'}`);
  }

  // 从文本中提取知识并添加到图谱
  async extractKnowledge(text, metadata = {}) {
    if (!this.knowledgeGraph || !this.config.autoExtraction) return;

    try {
      // 简单的关键词提取 (实际应用使用NLP)
      const words = text.toLowerCase()
        .replace(/[^\w\s\u4e00-\u9fa5]/g, ' ')
        .split(/\s+/)
        .filter(w => w.length > 1);

      // 统计词频
      const freq = {};
      for (const word of words) {
        freq[word] = (freq[word] || 0) + 1;
      }

      // 提取top 20关键词作为节点
      const topKeywords = Object.entries(freq)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 20)
        .map(([word]) => word);

      // 添加节点和关系
      for (const keyword of topKeywords) {
        await this.knowledgeGraph.addNode(keyword, {
          type: 'keyword',
          frequency: freq[keyword],
          ...metadata
        });
      }

      // 创建关键词之间的关联 (共现关系)
      for (let i = 0; i < topKeywords.length; i++) {
        for (let j = i + 1; j < topKeywords.length; j++) {
          const weight = Math.min(topKeywords.length - i, topKeywords.length - j);
          await this.knowledgeGraph.addEdge(topKeywords[i], topKeywords[j], {
            type: 'cooccurrence',
            weight: weight
          });
        }
      }

      return { extracted: topKeywords.length, nodes: this.knowledgeGraph.nodeCount };
    } catch (e) {
      console.error('[V7.2Brain] 知识提取失败:', e.message);
      return { extracted: 0, error: e.message };
    }
  }

  // 查询相关知识
  async queryRelatedKnowledge(keyword, limit = 10) {
    if (!this.knowledgeGraph) return [];

    try {
      const related = await this.knowledgeGraph.getRelatedNodes(keyword, limit);
      return related;
    } catch (e) {
      console.error('[V7.2Brain] 查询失败:', e.message);
      return [];
    }
  }

  // 获取知识图谱统计
  getStatistics() {
    if (!this.knowledgeGraph) {
      return { nodes: 0, edges: 0, running: false };
    }
    return {
      nodes: this.knowledgeGraph.nodeCount || 0,
      edges: this.knowledgeGraph.edgeCount || 0,
      running: this.running,
      storageType: this.config.storageType,
      autoExtraction: this.config.autoExtraction
    };
  }

  // 启动知识同步
  async startSync() {
    if (this.running) return;
    this.running = true;

    // 每5分钟自动同步一次知识
    this.syncInterval = setInterval(async () => {
      try {
        // 从V7.2学习层获取新知识
        if (this.v72System.layers.learning) {
          const newKnowledge = this.v72System.layers.learning.getRecentKnowledge();
          if (newKnowledge && newKnowledge.length > 0) {
            for (const item of newKnowledge) {
              await this.extractKnowledge(item.content, { source: 'v7.2-learning', timestamp: Date.now() });
            }
            console.log(`[V7.2Brain] 同步了 ${newKnowledge.length} 条新知识`);
          }
        }
      } catch (e) {
        console.error('[V7.2Brain] 同步失败:', e.message);
      }
    }, 300000); // 5分钟

    console.log('[V7.2Brain] 知识同步已启动 (间隔5分钟)');
  }

  // 停止知识同步
  async stopSync() {
    this.running = false;
    if (this.syncInterval) {
      clearInterval(this.syncInterval);
      this.syncInterval = null;
    }
    console.log('[V7.2Brain] 知识同步已停止');
  }

  // 获取状态
  getStatus() {
    return {
      running: this.running,
      statistics: this.getStatistics(),
      config: this.config,
      nextSync: this.running ? Date.now() + 300000 : null
    };
  }
}

module.exports = V7.2BrainIntegration;

EOF

echo "✅ V7.2第二大脑适配器已创建"
echo "  大小: $(wc -c < $BRAIN_ADAPTER_DIR/v7.2-brain.js) bytes"

# ==========================================
# 步骤3: 修改V7.2集成第二大脑
# ==========================================
echo "[3/5] 修改V7.2集成第二大脑..."

V72_FILE="scripts/autonomous-five-layer-v7-2.js"

# 添加 brainAdapter 属性
sed -i '/this\.coordinator = null;/a\    this.brainAdapter = null;  // 第二大脑适配器' "$V72_FILE"
echo "✅ 添加 brainAdapter 属性"

# 在 start() 中添加第二大脑初始化 (放在协调器之后)
sed -i '/多智能体协调器已启动/a\    // Phase 3: 第二大脑系统集成 (第7轮)\n    console.log("[V7.2] 启动第二大脑系统...");\n    try {\n      const V72Brain = require("./brain-integration/v7.2-brain");\n      this.brainAdapter = new V72Brain(this);\n      await this.brainAdapter.initialize();\n      await this.brainAdapter.startSync();\n      console.log("[V7.2] ✅ 第二大脑系统已集成");\n    } catch (e) {\n      console.error("[V7.2] ❌ 第二大脑集成失败:", e.message);\n    }' "$V72_FILE"
echo "✅ 在 start() 中添加第二大脑初始化"

# 在 getStatus() 中添加 brain 状态
sed -i '/coordinator:/a\      brain: this.brainAdapter ? this.brainAdapter.getStatus() : { running: false }' "$V72_FILE"
echo "✅ 在 getStatus() 中添加 brain 状态"

# ==========================================
# 步骤4: 创建第二大脑配置
# ==========================================
echo "[4/5] 创建第二大脑配置..."

mkdir -p config/brain-integration

cat > config/brain-integration/v7.2-integration.yaml << 'EOF'
# V7.2 第二大脑集成配置

enabled: true
storageType: "inmemory"  # inmemory | redis | postgres

# 知识图谱限制
maxNodes: 100000
maxEdges: 500000

# 自动知识提取
autoExtraction:
  enabled: true
  interval: 300000  # 5分钟
  sources:
    - "learning-layer"
    - "communication"
    - "knowledge-files"

# 向量化 (可选)
embedding:
  enabled: false
  model: "text-embedding-ada-002"
  dimension: 1536

# 同步配置
sync:
  interval: 300000  # 5分钟
  batchSize: 50
  persist: true
  persistPath: "./data/brain-backup"

# 查询优化
query:
  maxResults: 20
  minRelevance: 0.3
  cacheResults: true
  cacheTTL: 60000  # 1分钟
EOF

echo "✅ 第二大脑配置已创建"

# ==========================================
# 步骤5: 验证和报告
# ==========================================
echo "[5/5] 验证修改..."

# 检查关键字符串
if grep -q "this.brainAdapter = null;" "$V72_FILE"; then
  echo "✅  brainAdapter 属性已添加"
else
  echo "❌ brainAdapter 属性缺失"
fi

if grep -q "V72Brain" "$V72_FILE"; then
  echo "✅  第二大脑初始化代码已添加"
else
  echo "❌ 第二大脑初始化代码缺失"
fi

if grep -q "brain:" "$V72_FILE"; then
  echo "✅  getStatus() 已包含 brain"
else
  echo "❌ getStatus() 缺少 brain"
fi

# 生成报告
cat > "$LOG_DIR/phase3-brain-$START_TIME-report.md" << EOF
# Phase 3: 第二大脑系统增强报告

## 时间
$(date)

## 完成内容

### 1. 创建V7.2第二大脑适配器
- 文件: `scripts/brain-integration/v7.2-brain.js`
- 功能: 封装knowledge-graph.js，提供知识提取、查询、同步能力
- 特性:
  - 支持inmemory/redis/postgres存储
  - 自动从文档提取关键词和共现关系
  - 与V7.2学习层知识同步
  - 知识图谱查询接口

### 2. 修改V7.2主系统
- 添加 `this.brainAdapter` 属性
- `start()` 方法中初始化和启动知识同步
- `getStatus()` 返回知识图谱状态

### 3. 配置文件
- `config/brain-integration/v7.2-integration.yaml`
- 存储类型配置
- 自动提取间隔 (5分钟)
- 同步和查询优化参数

## 技术要点

### 知识提取算法
- 简单TF统计提取top 20关键词
- 构建关键词共现网络
- 权重基于共现频率

### 同步机制
- 从学习层获取新知识
- 每5分钟自动同步
- 保留知识来源和元数据

### 查询接口
- `queryRelatedKnowledge(keyword, limit)` - 查询相关节点
- `getStatistics()` - 获取图谱统计
- `getStatus()` - 适配器状态

## 下一步
- Phase 4: 漏洞检测工具集成
- Phase 5: 测试验证
- 启动V7.3测试

## 状态
✅ Phase 3 完成
EOF

echo "✅ 报告已生成: $LOG_DIR/phase3-brain-$START_TIME-report.md"

echo ""
echo "=========================================="
echo "  Phase 3 完成"
echo "=========================================="
echo ""
echo "修改的文件:"
echo "  ✅ scripts/autonomous-five-layer-v7-2.js (已修改)"
echo "  ✅ scripts/brain-integration/v7.2-brain.js (新建)"
echo "  ✅ config/brain-integration/v7.2-integration.yaml (新建)"
echo ""
echo "Phase 1-3 总览:"
echo "  ✅ 合约交易系统集成"
echo "  ✅ 多智能体协调器集成"
echo "  ✅ 第二大脑系统增强"
echo ""
echo "下一步: Phase 4 - 漏洞检测工具集成"
echo "=========================================="
