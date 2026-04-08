#!/usr/bin/env node
// Transfer Learning Engine - V7.3
// 迁移学习：跨领域知识迁移

class TransferLearningEngine {
  constructor() {
    this.name = 'transfer-learning';
    this.enabled = true;
    this.sourceDomains = new Map(); // 源领域知识
    this.targetDomain = null;       // 目标领域
    this.transferablePatterns = [];
    this.similarityThreshold = 0.6;
  }

  // 注册源领域知识
  registerSourceDomain(domainName, knowledge) {
    this.sourceDomains.set(domainName, {
      knowledge,
      features: this.extractFeatures(knowledge),
      patterns: this.identifyPatterns(knowledge),
      createdAt: Date.now()
    });
  }

  // 设置目标领域
  setTargetDomain(domainKnowledge) {
    this.targetDomain = {
      knowledge: domainKnowledge,
      features: this.extractFeatures(domainKnowledge),
      createdAt: Date.now()
    };
  }

  // 提取特征向量 (简化版)
  extractFeatures(knowledge) {
    // 实际应使用深度学习模型提取语义特征
    // 这里使用基于关键词的简单特征提取
    const features = {
      keywords: this.extractKeywords(knowledge),
      complexity: this.measureComplexity(knowledge),
      structure: this.analyzeStructure(knowledge)
    };
    return features;
  }

  extractKeywords(text) {
    // 简单关键词提取 (实际应使用NLP模型)
    const words = String(text).toLowerCase().split(/\s+/);
    const stopWords = new Set(['the', 'is', 'and', 'to', 'of', 'a', 'in']);
    const keywords = words.filter(w => w.length > 3 && !stopWords.has(w));
    return [...new Set(keywords)].slice(0, 20);
  }

  measureComplexity(knowledge) {
    const text = String(knowledge);
    const words = text.split(/\s+/).length;
    const sentences = text.split(/[.!?]+/).length;
    const avgSentenceLength = words / Math.max(sentences, 1);
    return Math.min(avgSentenceLength / 10, 1); // 归一化到0-1
  }

  analyzeStructure(knowledge) {
    const text = String(knowledge);
    const hasLists = /^\s*[-*]|\d+\./.test(text);
    const hasCode = /```|`[^`]+`/.test(text);
    const hasTables = /\|.*\|/.test(text);
    return { hasLists, hasCode, hasTables };
  }

  // 识别模式
  identifyPatterns(knowledge) {
    const patterns = [];
    const text = String(knowledge);

    // 检测常见模式
    if (/\b(if|else|switch)\b/.test(text)) patterns.push('control-flow');
    if (/\b(for|while|do)\b/.test(text)) patterns.push('looping');
    if (/\b(function|class|def)\b/.test(text)) patterns.push('definition');
    if (/\b(import|require|include)\b/.test(text)) patterns.push('dependency');
    if (/\d{4}-\d{2}-\d{2}/.test(text)) patterns.push('date-format');
    if (/[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/i.test(text)) patterns.push('email');

    return patterns;
  }

  // 计算领域相似度
  calculateSimilarity(domainA, domainB) {
    const keywordOverlap = this.calculateKeywordOverlap(
      domainA.features.keywords,
      domainB.features.keywords
    );
    const patternOverlap = this.calculatePatternOverlap(
      domainA.features.patterns,
      domainB.features.patterns
    );
    const structureSimilarity = this.calculateStructureSimilarity(
      domainA.features.structure,
      domainB.features.structure
    );

    const complexityDiff = 1 - Math.abs(
      domainA.features.complexity - domainB.features.complexity
    );

    // 加权综合相似度
    const similarity = 
      keywordOverlap * 0.4 +
      patternOverlap * 0.3 +
      structureSimilarity * 0.2 +
      complexityDiff * 0.1;

    return similarity;
  }

  calculateKeywordOverlap(keywordsA, keywordsB) {
    const setA = new Set(keywordsA);
    const setB = new Set(keywordsB);
    const intersection = new Set([...setA].filter(x => setB.has(x)));
    const union = new Set([...setA, ...setB]);
    return union.size > 0 ? intersection.size / union.size : 0;
  }

  calculatePatternOverlap(patternsA, patternsB) {
    const setA = new Set(patternsA);
    const setB = new Set(patternsB);
    const intersection = new Set([...setA].filter(x => setB.has(x)));
    const union = new Set([...setA, ...setB]);
    return union.size > 0 ? intersection.size / union.size : 0;
  }

  calculateStructureSimilarity(structA, structB) {
    let matchCount = 0;
    let totalCount = 0;
    for (const key in structA) {
      if (structA[key] === structB[key]) matchCount++;
      totalCount++;
    }
    return totalCount > 0 ? matchCount / totalCount : 0;
  }

  // 寻找可迁移的模式
  findTransferablePatterns() {
    if (!this.targetDomain) {
      throw new Error('Target domain not set');
    }

    this.transferablePatterns = [];

    for (const [domainName, sourceDomain] of this.sourceDomains) {
      const similarity = this.calculateSimilarity(sourceDomain, this.targetDomain);
      
      if (similarity >= this.similarityThreshold) {
        // 找出目标领域缺失但源领域拥有的模式
        const missingPatterns = sourceDomain.patterns.filter(p => 
          !this.targetDomain.features.patterns.includes(p)
        );

        this.transferablePatterns.push({
          sourceDomain: domainName,
          similarity,
          patterns: missingPatterns,
          confidence: similarity * missingPatterns.length
        });
      }
    }

    // 按置信度排序
    this.transferablePatterns.sort((a, b) => b.confidence - a.confidence);

    return this.transferablePatterns;
  }

  // 执行迁移学习
  async transferLearning() {
    const transferable = this.findTransferablePatterns();
    
    if (transferable.length === 0) {
      return {
        success: false,
        message: 'No transferable patterns found above threshold',
        threshold: this.similarityThreshold
      };
    }

    // 应用最高置信度的迁移
    const bestTransfer = transferable[0];
    
    // 这里应实际应用迁移的知识
    // 简化: 仅记录迁移事件
    const transferResult = {
      success: true,
      sourceDomain: bestTransfer.sourceDomain,
      transferredPatterns: bestTransfer.patterns,
      similarity: bestTransfer.similarity,
      confidence: bestTransfer.confidence,
      timestamp: Date.now()
    };

    return transferResult;
  }

  getStatus() {
    return {
      name: this.name,
      enabled: this.enabled,
      sourceDomainsCount: this.sourceDomains.size,
      targetDomainSet: this.targetDomain !== null,
      transferablePatterns: this.transferablePatterns.length,
      similarityThreshold: this.similarityThreshold,
      status: 'active'
    };
  }
}

module.exports = { TransferLearningEngine };
