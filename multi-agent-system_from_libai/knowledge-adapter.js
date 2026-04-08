#!/usr/bin/env node
/**
 * 知识库系统适配器
 * 接收多智能体系统的学习成果并存储到知识库
 */

const fs = require('fs');
const path = require('path');

class KnowledgeAdapter {
  constructor(config = {}) {
    this.config = {
      storagePath: config.storagePath || path.join(__dirname, '../knowledge/integrated'),
      autoIndex: config.autoIndex !== false,
      ...config
    };
    this.stats = {
      learningsStored: 0,
      updatesProcessed: 0,
      insightsGenerated: 0
    };
    
    // 确保存储目录存在
    if (!fs.existsSync(this.config.storagePath)) {
      fs.mkdirSync(this.config.storagePath, { recursive: true });
    }
  }

  async handleMessage(msg) {
    const content = msg.content;
    
    if (content.type === 'learning_result' || content.learning) {
      return await this.storeLearningResult(content, msg);
    } else if (content.type === 'knowledge_update' || content.update) {
      return await this.processKnowledgeUpdate(content, msg);
    } else if (content.type === 'insight' || content.insight) {
      return await this.generateInsight(content, msg);
    }
    
    return { handled: false };
  }

  async storeLearningResult(data, sourceMsg) {
    const learningEntry = {
      id: `learning-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      timestamp: new Date().toISOString(),
      source: sourceMsg.from,
      topic: data.topic || 'general',
      content: data.content || data.learning,
      confidence: data.confidence || 0.8,
      tags: data.tags || [],
      references: data.references || []
    };

    // 存储到文件
    const filename = `${learningEntry.id}.json`;
    const filepath = path.join(this.config.storagePath, 'learnings', filename);
    
    if (!fs.existsSync(path.dirname(filepath))) {
      fs.mkdirSync(path.dirname(filepath), { recursive: true });
    }
    
    fs.writeFileSync(filepath, JSON.stringify(learningEntry, null, 2));
    this.stats.learningsStored++;
    
    console.log(`[Knowledge] 学习成果已存储: ${learningEntry.topic}`);
    
    // 更新知识索引
    if (this.config.autoIndex) {
      await this.updateIndex(learningEntry);
    }
    
    return { stored: true, id: learningEntry.id };
  }

  async processKnowledgeUpdate(data, sourceMsg) {
    const updateEntry = {
      id: `update-${Date.now()}`,
      timestamp: new Date().toISOString(),
      source: sourceMsg.from,
      type: data.updateType || 'general',
      description: data.description,
      affectedAreas: data.affectedAreas || [],
      before: data.before,
      after: data.after
    };

    // 存储更新记录
    const filename = `update-${Date.now()}.json`;
    const filepath = path.join(this.config.storagePath, 'updates', filename);
    
    if (!fs.existsSync(path.dirname(filepath))) {
      fs.mkdirSync(path.dirname(filepath), { recursive: true });
    }
    
    fs.writeFileSync(filepath, JSON.stringify(updateEntry, null, 2));
    this.stats.updatesProcessed++;
    
    console.log(`[Knowledge] 知识更新已记录: ${updateEntry.type}`);
    
    return { updated: true, id: updateEntry.id };
  }

  async generateInsight(data, sourceMsg) {
    const insight = {
      id: `insight-${Date.now()}`,
      timestamp: new Date().toISOString(),
      generatedBy: sourceMsg.from,
      pattern: data.pattern,
      conclusion: data.conclusion,
      confidence: data.confidence || 0.7,
      applicableTo: data.applicableTo || []
    };

    // 存储洞察
    const filename = `insight-${Date.now()}.json`;
    const filepath = path.join(this.config.storagePath, 'insights', filename);
    
    if (!fs.existsSync(path.dirname(filepath))) {
      fs.mkdirSync(path.dirname(filepath), { recursive: true });
    }
    
    fs.writeFileSync(filepath, JSON.stringify(insight, null, 2));
    this.stats.insightsGenerated++;
    
    console.log(`[Knowledge] 新洞察已生成: ${insight.pattern}`);
    
    return { generated: true, id: insight.id };
  }

  async updateIndex(learningEntry) {
    const indexPath = path.join(this.config.storagePath, 'index.json');
    let index = { lastUpdated: new Date().toISOString(), entries: [] };
    
    if (fs.existsSync(indexPath)) {
      try {
        index = JSON.parse(fs.readFileSync(indexPath, 'utf8'));
      } catch (e) {
        console.warn('[Knowledge] 索引读取失败，创建新索引');
      }
    }
    
    // 添加新条目到索引
    index.entries.unshift({
      id: learningEntry.id,
      topic: learningEntry.topic,
      timestamp: learningEntry.timestamp,
      source: learningEntry.source,
      confidence: learningEntry.confidence
    });
    
    // 限制索引大小
    if (index.entries.length > 1000) {
      index.entries = index.entries.slice(0, 1000);
    }
    
    index.lastUpdated = new Date().toISOString();
    
    fs.writeFileSync(indexPath, JSON.stringify(index, null, 2));
  }

  query(topic, limit = 10) {
    const indexPath = path.join(this.config.storagePath, 'index.json');
    if (!fs.existsSync(indexPath)) return [];
    
    const index = JSON.parse(fs.readFileSync(indexPath, 'utf8'));
    const filtered = index.entries.filter(e => 
      e.topic.toLowerCase().includes(topic.toLowerCase())
    );
    
    return filtered.slice(0, limit);
  }

  getStats() {
    return this.stats;
  }
}

module.exports = KnowledgeAdapter;
