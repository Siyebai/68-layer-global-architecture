/**
 * V72BrainIntegration - 第二大脑系统适配器
 * 集成knowledge-graph到V7.2学习层
 */

const path = require('path');

class V72BrainIntegration {
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
      const brainDir = path.join(__dirname, '..', '..', 'lib', 'brain');
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

module.exports = V72BrainIntegration;

