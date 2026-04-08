#!/usr/bin/env node
// 知识库批量导入工具
// 扫描 knowledge/ 目录，将所有文档导入知识图谱

const fs = require('fs');
const path = require('path');
const { KnowledgeGraphAPI } = require('../lib/brain/knowledge-graph-api');

class KnowledgeImporter {
  constructor() {
    this.knowledgeBase = new KnowledgeGraphAPI();
    this.importedNodes = 0;
    this.importedEdges = 0;
    this.errors = [];
    this.stats = {
      totalFiles: 0,
      processedFiles: 0,
      totalNodes: 0,
      totalEdges: 0,
      byType: {}
    };
  }

  async initialize() {
    console.log('[KnowledgeImporter] 初始化...');
    await this.knowledgeBase.initialize();
    console.log('[KnowledgeImporter] 知识图谱API已就绪');
  }

  async importAll(directory = '../knowledge') {
    const absoluteDir = path.resolve(__dirname, directory);
    console.log(`[KnowledgeImporter] 扫描目录: ${absoluteDir}`);

    if (!fs.existsSync(absoluteDir)) {
      throw new Error(`目录不存在: ${absoluteDir}`);
    }

    // 递归扫描所有markdown文件
    const files = this.scanMarkdownFiles(absoluteDir);
    this.stats.totalFiles = files.length;
    console.log(`[KnowledgeImporter] 找到 ${files.length} 个markdown文件`);

    // 批量导入
    for (const file of files) {
      try {
        await this.importFile(file);
        this.stats.processedFiles++;
      } catch (err) {
        this.errors.push({ file, error: err.message });
        console.error(`[KnowledgeImporter] 导入失败: ${file} - ${err.message}`);
      }

      // 每10个文件输出进度
      if (this.stats.processedFiles % 10 === 0) {
        console.log(`[KnowledgeImporter] 进度: ${this.stats.processedFiles}/${files.length} 文件已处理`);
      }
    }

    // 建立文档间关系
    console.log('[KnowledgeImporter] 建立文档间关联...');
    await this.buildRelationships();

    // 输出统计
    this.printStats();

    return {
      imported: this.importedNodes,
      edges: this.importedEdges,
      errors: this.errors.length,
      stats: this.stats
    };
  }

  scanMarkdownFiles(dir, fileList = []) {
    const entries = fs.readdirSync(dir, { withFileTypes: true });

    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);

      if (entry.isDirectory()) {
        // 跳过某些目录
        if (['node_modules', '.git', 'tmp', 'cache'].includes(entry.name)) {
          continue;
        }
        this.scanMarkdownFiles(fullPath, fileList);
      } else if (entry.isFile() && entry.name.endsWith('.md')) {
        fileList.push(fullPath);
      }
    }

    return fileList;
  }

  async importFile(filePath) {
    const content = fs.readFileSync(filePath, 'utf8');
    const relativePath = path.relative(path.resolve(__dirname, '../'), filePath);
    const stat = fs.statSync(filePath);

    // 提取元数据
    const metadata = this.extractMetadata(content, relativePath, stat);

    // 创建文档节点
    const docId = this.generateDocId(relativePath);
    await this.knowledgeBase.addEntity(docId, 'document', metadata);

    // 将文档内容分段创建知识节点
    const chunks = this.splitContent(content);
    const nodeIds = [];

    for (let i = 0; i < chunks.length; i++) {
      const chunk = chunks[i];
      const nodeId = `${docId}_chunk_${i}`;

      const nodeData = {
        documentId: docId,
        chunkIndex: i,
        content: chunk,
        type: this.classifyContent(chunk),
        wordCount: chunk.length,
        path: relativePath
      };

      await this.knowledgeBase.addEntity(nodeId, 'knowledge', nodeData);
      nodeIds.push(nodeId);

      // 建立与父文档的关系
      await this.knowledgeBase.addRelation(docId, nodeId, 'contains', 1.0);
    }

    // 建立文档间关系 (基于路径和内容)
    await this.buildDocumentRelations(docId, relativePath);

    this.importedNodes += 1 + chunks.length;
    this.importedEdges += 1 + chunks.length; // contains关系

    // 更新统计
    this.stats.totalNodes += 1 + chunks.length;
    const type = metadata.category || 'uncategorized';
    this.stats.byType[type] = (this.stats.byType[type] || 0) + 1;
  }

  extractMetadata(content, filePath, stat) {
    const lines = content.split('\n');
    const frontmatter = {};
    let contentStart = 0;

    // 提取 YAML frontmatter (如果有)
    if (lines[0] === '---') {
      let inFrontmatter = false;
      for (let i = 1; i < lines.length; i++) {
        if (lines[i] === '---') {
          inFrontmatter = false;
          contentStart = i + 1;
          break;
        }
        if (inFrontmatter) {
          const match = lines[i].match(/^(\w+):\s*(.+)$/);
          if (match) {
            frontmatter[match[1]] = match[2];
          }
        }
        if (lines[i] === '' && !inFrontmatter) {
          inFrontmatter = true;
        }
      }
    }

    // 提取标题 (第一个标题或文件名)
    let title = path.basename(filePath, '.md');
    const titleMatch = content.match(/^#\s+(.+)$/m);
    if (titleMatch) {
      title = titleMatch[1];
    }

    // 提取标签
    const tags = [];
    const tagMatch = content.match(/标签[：:]\s*(\w+(?:,\s*\w+)*)/);
    if (tagMatch) {
      tags.push(...tagMatch[1].split(/\s*,\s*/));
    }

    // 估算阅读时间 (中文500字/分钟)
    const chineseChars = (content.match(/[\u4e00-\u9fa5]/g) || []).length;
    const englishWords = (content.match(/[a-zA-Z]+/g) || []).length;
    const readingTime = Math.ceil((chineseChars / 500) + (englishWords / 200));

    return {
      title: frontmatter.title || title,
      path: filePath,
      size: stat.size,
      modified: stat.mtime.toISOString(),
      created: stat.birthtime?.toISOString() || stat.mtime.toISOString(),
      tags: [...tags, ...(frontmatter.tags ? frontmatter.tags.split(',').map(t => t.trim()) : [])],
      category: this.categorizePath(filePath),
      readingTime,
      wordCount: content.length,
      ...frontmatter
    };
  }

  categorizePath(filePath) {
    const parts = filePath.split(path.sep);
    if (parts.includes('knowledge')) {
      const idx = parts.indexOf('knowledge');
      return parts[idx + 1] || 'knowledge';
    }
    return 'uncategorized';
  }

  splitContent(content, maxChunkSize = 1000) {
    // 按段落分割，保持语义完整性
    const paragraphs = content.split(/\n\s*\n/);
    const chunks = [];
    let currentChunk = '';

    for (const para of paragraphs) {
      if ((currentChunk + para).length > maxChunkSize && currentChunk.length > 0) {
        chunks.push(currentChunk.trim());
        currentChunk = para;
      } else {
        currentChunk += (currentChunk ? '\n\n' : '') + para;
      }
    }

    if (currentChunk.length > 0) {
      chunks.push(currentChunk.trim());
    }

    // 限制每个文档最多20个chunks，避免过度分割
    if (chunks.length > 20) {
      chunks.splice(20);
    }

    return chunks;
  }

  classifyContent(text) {
    const lower = text.toLowerCase();
    if (lower.includes('交易') || lower.includes('trading')) return 'trading';
    if (lower.includes('策略') || lower.includes('strategy')) return 'strategy';
    if (lower.includes('风险') || lower.includes('risk')) return 'risk';
    if (lower.includes('学习') || lower.includes('learning')) return 'learning';
    if (lower.includes('系统') || lower.includes('system')) return 'system';
    if (lower.includes('代码') || lower.includes('code')) return 'code';
    if (lower.includes('配置') || lower.includes('config')) return 'config';
    if (lower.includes('文档') || lower.includes('documentation')) return 'documentation';
    return 'general';
  }

  generateDocId(filePath) {
    // 使用文件相对路径作为ID，确保唯一性
    return `doc:${filePath.replace(/[\\/]/g, ':')}`;
  }

  async buildDocumentRelations(docId, filePath) {
    // 基于路径建立关系: 同一目录的文档互相关联
    const dir = path.dirname(filePath);
    const baseName = path.basename(filePath, '.md');

    // 查找同一目录下的其他文档
    const relatedDocs = this.findRelatedDocuments(dir, baseName);

    for (const related of relatedDocs) {
      const relatedId = this.generateDocId(related);
      // 双向关联
      await this.knowledgeBase.addRelation(docId, relatedId, 'related_to', 0.7);
      await this.knowledgeBase.addRelation(relatedId, docId, 'related_to', 0.7);
      this.importedEdges += 2;
    }
  }

  findRelatedDocuments(dir, excludeBase, maxResults = 5) {
    const absoluteDir = path.resolve(__dirname, '../', dir);
    if (!fs.existsSync(absoluteDir)) return [];

    const files = fs.readdirSync(absoluteDir).filter(f => f.endsWith('.md') && !f.startsWith(excludeBase));
    return files.slice(0, maxResults).map(f => path.join(dir, f));
  }

  async buildRelationships() {
    // 可以在这里添加更复杂的关系挖掘逻辑
    // 例如: 基于标签、内容相似度等
    console.log('[KnowledgeImporter] 关系构建完成');
  }

  printStats() {
    console.log('\n========================================');
    console.log('📊 知识导入统计报告');
    console.log('========================================');
    console.log(`📁 扫描文件总数: ${this.stats.totalFiles}`);
    console.log(`✅ 成功处理: ${this.stats.processedFiles}`);
    console.log(`🔄 跳过/失败: ${this.stats.totalFiles - this.stats.processedFiles}`);
    console.log(`📝 创建节点总数: ${this.stats.totalNodes}`);
    console.log(`🔗 创建边总数: ${this.importedEdges}`);
    console.log(`❌ 错误数量: ${this.errors.length}`);

    console.log('\n📂 分类统计:');
    for (const [type, count] of Object.entries(this.stats.byType)) {
      console.log(`  - ${type}: ${count} 个文档`);
    }

    if (this.errors.length > 0) {
      console.log('\n⚠️  错误列表 (前10个):');
      this.errors.slice(0, 10).forEach(err => {
        console.log(`  - ${err.file}: ${err.error}`);
      });
    }

    console.log('\n✅ 知识库导入完成!');
    console.log('========================================\n');
  }
}

// 执行导入
async function main() {
  const importer = new KnowledgeImporter();

  try {
    await importer.initialize();
    const result = await importer.importAll();

    console.log('导入结果:', JSON.stringify(result, null, 2));
    process.exit(0);
  } catch (error) {
    console.error('导入失败:', error);
    process.exit(1);
  }
}

main();
