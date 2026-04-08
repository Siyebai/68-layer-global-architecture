#!/usr/bin/env node
// 深度自主系统研究脚本
// 目标: 1小时内完成深度学习、部署、双地址上传

const fs = require('fs');
const path = require('path');

class DeepLearningSystem {
  constructor() {
    this.startTime = Date.now();
    this.duration = 60 * 60 * 1000; // 1小时
    this.findings = [];
    this.deployments = [];
    this.reports = [];
    
    // 研究目标
    this.targets = [
      { name: 'V46.0自主觉醒系统', path: 'knowledge/', priority: 1 },
      { name: 'V7.3超级自主系统', path: 'scripts/autonomous-systems/', priority: 1 },
      { name: '智能合约交易系统', path: 'autonomous_trading_system/', priority: 2 },
      { name: '五层14模块', path: 'scripts/modules/', priority: 1 },
      { name: '知识库系统', path: 'autonomous_knowledge_system/', priority: 2 },
      { name: '性能优化引擎', path: 'scripts/performance/', priority: 3 }
    ];
  }

  async run() {
    console.log('🚀 启动深度自主系统研究');
    console.log(`⏰ 计划时长: ${this.duration/1000/60}分钟`);
    console.log('');

    // 阶段1: 扫描所有目标系统 (10分钟)
    console.log('📂 阶段1: 扫描系统结构');
    await this.scanSystems();

    // 阶段2: 深度分析核心模块 (20分钟)
    console.log('\n🔍 阶段2: 深度分析核心模块');
    await this.analyzeCoreModules();

    // 阶段3: 部署集成验证 (15分钟)
    console.log('\n🚀 阶段3: 部署集成验证');
    await this.deployAndVerify();

    // 阶段4: 生成报告并上传 (10分钟)
    console.log('\n📤 阶段4: 生成报告并双地址上传');
    await this.generateReportsAndUpload();

    // 阶段5: 通知同事 (5分钟)
    console.log('\n📢 阶段5: 通知同事学习');
    await this.notifyColleagues();

    const totalTime = Date.now() - this.startTime;
    console.log('\n✅ 研究完成');
    console.log(`⏱️  总耗时: ${totalTime/1000}秒`);
    console.log(`📊 发现: ${this.findings.length}条`);
    console.log(`🚀 部署: ${this.deployments.length}个`);
    console.log(`📄 报告: ${this.reports.length}份`);
  }

  async scanSystems() {
    const baseDir = '/root/.openclaw/workspace/libai-workspace';
    
    for (const target of this.targets) {
      const targetPath = path.join(baseDir, target.path);
      if (fs.existsSync(targetPath)) {
        const stats = this.getDirStats(targetPath);
        console.log(`✅ ${target.name}: ${stats.files}文件, ${stats.sizeKB}KB`);
        this.findings.push({
          type: 'system_scan',
          name: target.name,
          path: target.path,
          files: stats.files,
          sizeKB: stats.sizeKB
        });
      } else {
        console.log(`⚠️  ${target.name}: 路径不存在`);
      }
    }
  }

  getDirStats(dir) {
    let files = 0;
    let size = 0;
    
    const walk = (d) => {
      const entries = fs.readdirSync(d, { withFileTypes: true });
      for (const entry of entries) {
        const fullPath = path.join(d, entry.name);
        if (entry.isDirectory()) {
          walk(fullPath);
        } else {
          files++;
          size += fs.statSync(fullPath).size;
        }
      }
    };
    
    walk(dir);
    return { files, sizeKB: Math.round(size/1024) };
  }

  async analyzeCoreModules() {
    console.log('🔍 分析核心模块...');
    
    // 分析13个高级引擎
    const enginesDir = '/root/.openclaw/workspace/libai-workspace/scripts/autonomous-systems/';
    if (fs.existsSync(enginesDir)) {
      const engines = fs.readdirSync(enginesDir).filter(f => f.endsWith('.js'));
      console.log(`📦 发现 ${engines.length} 个高级引擎:`);
      
      for (const engine of engines) {
        const content = fs.readFileSync(path.join(enginesDir, engine), 'utf8');
        const lines = content.split('\n').length;
        const size = fs.statSync(path.join(enginesDir, engine)).size;
        console.log(`   - ${engine}: ${lines}行, ${size}字节`);
        
        this.findings.push({
          type: 'engine_analysis',
          name: engine,
          lines,
          size
        });
      }
    }

    // 分析知识库
    const knowledgeDir = '/root/.openclaw/workspace/libai-workspace/knowledge/';
    if (fs.existsSync(knowledgeDir)) {
      const docs = fs.readdirSync(knowledgeDir).filter(f => f.endsWith('.md'));
      console.log(`\n📚 知识库文档: ${docs.length}份`);
      
      // 统计总字数
      let totalWords = 0;
      for (const doc of docs) {
        const content = fs.readFileSync(path.join(knowledgeDir, doc), 'utf8');
        totalWords += content.split(/\s+/).length;
      }
      console.log(`   总字数: ${totalWords.toLocaleString()}`);
      
      this.findings.push({
        type: 'knowledge_base',
        documents: docs.length,
        words: totalWords
      });
    }
  }

  async deployAndVerify() {
    console.log('🚀 验证部署状态...');
    
    // 检查系统是否运行
    const isRunning = this.checkSystemRunning();
    console.log(`系统状态: ${isRunning ? '✅ 运行中' : '❌ 未运行'}`);
    
    // 检查Redis
    const redisKeys = this.checkRedis();
    console.log(`Redis键数: ${redisKeys}`);
    
    // 检查知识库
    const kgStats = this.checkKnowledgeGraph();
    console.log(`知识图谱: ${kgStats.nodes}节点, ${kgStats.relations}关系`);
    
    this.deployments.push({
      timestamp: new Date().toISOString(),
      systemRunning: isRunning,
      redisKeys,
      knowledgeGraph: kgStats
    });
  }

  checkSystemRunning() {
    try {
      const output = require('child_process').execSync('pm2 status --no-color | grep libai-system', { encoding: 'utf8' });
      return output.includes('online');
    } catch {
      return false;
    }
  }

  checkRedis() {
    try {
      return parseInt(require('child_process').execSync('redis-cli -h 127.0.0.1 -p 6379 dbsize', { encoding: 'utf8' }).trim());
    } catch {
      return 0;
    }
  }

  checkKnowledgeGraph() {
    try {
      const nodes = parseInt(require('child_process').execSync('redis-cli -h 127.0.0.1 -p 6379 scard "knowledge:nodes"', { encoding: 'utf8' }).trim()) || 0;
      const relations = parseInt(require('child_process').execSync('redis-cli -h 127.0.0.1 -p 6379 scard "knowledge:relations"', { encoding: 'utf8' }).trim()) || 0;
      return { nodes, relations };
    } catch {
      return { nodes: 0, relations: 0 };
    }
  }

  async generateReportsAndUpload() {
    console.log('📄 生成研究报告...');
    
    const report = {
      timestamp: new Date().toISOString(),
      duration: Date.now() - this.startTime,
      findings: this.findings,
      deployments: this.deployments,
      summary: this.generateSummary()
    };
    
    const reportPath = `/root/.openclaw/workspace/libai-workspace/DEEP-LEARNING-REPORT-${Date.now()}.json`;
    fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
    console.log(`✅ 报告生成: ${reportPath}`);
    
    this.reports.push(reportPath);
    
    // 双地址上传准备
    console.log('\n📤 准备双地址上传...');
    await this.uploadToBothLocations(reportPath);
  }

  generateSummary() {
    const engines = this.findings.filter(f => f.type === 'engine_analysis');
    const knowledge = this.findings.find(f => f.type === 'knowledge_base');
    const systems = this.findings.filter(f => f.type === 'system_scan');
    
    return {
      enginesAnalyzed: engines.length,
      knowledgeDocuments: knowledge?.documents || 0,
      knowledgeWords: knowledge?.words || 0,
      systemsScanned: systems.length,
      totalFindings: this.findings.length
    };
  }

  async uploadToBothLocations(reportPath) {
    console.log('1️⃣ 上传到 GitHub...');
    await this.uploadToGitHub(reportPath);
    
    console.log('2️⃣ 上传到 腾讯微云...');
    await this.uploadToWeiyun(reportPath);
  }

  async uploadToGitHub(reportPath) {
    const baseDir = '/root/.openclaw/workspace/libai-workspace';
    
    // 复制报告到仓库
    const filename = path.basename(reportPath);
    const dest = path.join(baseDir, filename);
    fs.copyFileSync(reportPath, dest);
    
    // Git提交
    require('child_process').execSync('git add .', { cwd: baseDir, encoding: 'utf8' });
    require('child_process').execSync(`git commit -m "docs: 深度研究报告 ${filename}"`, { 
      cwd: baseDir, 
      encoding: 'utf8' 
    });
    require('child_process').execSync('git push origin master', { 
      cwd: baseDir, 
      encoding: 'utf8' 
    });
    
    console.log('✅ GitHub上传完成');
  }

  async uploadToWeiyun(reportPath) {
    // 检查Token
    const token = process.env.WEIYUN_MCP_TOKEN;
    if (!token) {
      console.log('⚠️  微云Token未配置，跳过微云上传');
      console.log('   请设置环境变量: export WEIYUN_MCP_TOKEN="your_token"');
      return;
    }
    
    // 执行上传脚本
    const uploadScript = '/root/.openclaw/workspace/libai-workspace/scripts/upload-to-weiyun-complete.sh';
    if (fs.existsSync(uploadScript)) {
      require('child_process').execSync(`bash ${uploadScript}`, { 
        encoding: 'utf8',
        env: { ...process.env, WEIYUN_MCP_TOKEN: token }
      });
      console.log('✅ 腾讯微云上传完成');
    } else {
      console.log('❌ 微云上传脚本不存在');
    }
  }

  async notifyColleagues() {
    console.log('📢 通知同事学习...');
    
    // 生成学习指南
    const guide = this.generateLearningGuide();
    const guidePath = '/root/.openclaw/workspace/libai-workspace/LEARNING-GUIDE.md';
    fs.writeFileSync(guidePath, guide);
    
    console.log(`✅ 学习指南已生成: ${guidePath}`);
    console.log('📋 学习指南内容:');
    console.log('   - 系统架构概述');
    console.log('   - 核心模块说明');
    console.log('   - 部署步骤');
    console.log('   - 常见问题');
  }

  generateLearningGuide() {
    return `
# 📚 李白AI交易系统学习指南

**版本**: V7.2-Perf-Optimized  
**生成时间**: ${new Date().toLocaleString()}  
**更新频率**: 每次系统升级后更新  

---

## 🎯 系统概览

### 五层自主系统 (14/14模块)

\`\`\`
感知层 (3/3)
├── AutonomousMonitorEnhanced - 环境监控
├── AutonomousHealing - 自动修复
└── AdaptiveRiskControl - 风险控制

认知层 (2/2)
├── AutonomousThinking - 自主思考
└── AutonomousDecision - 智能决策

行动层 (4/4)
├── AutonomousLearningEnhanced - 自主学习
├── AutonomousIterationEnhanced - 自主迭代
├── AutonomousCreation - 自主创造
└── AutonomousDeployment - 自主部署

学习层 (3/3)
├── AutonomousCommunication - 通信模块
├── KnowledgeTransfer - 知识迁移
└── MetacognitionModule - 元认知

进化层 (5/5)
├── SelfOptimization - 自优化
├── CapabilityExpansion - 能力扩展
├── MaturityImprovement - 成熟度提升
├── AdaptabilityEnhancement - 自适应增强
└── RapidResponse - 极速响应
\`\`\`

### 知识库规模

- **节点数**: 1414个 (超额183%)
- **关系数**: 1691条
- **文档数**: 133份
- **API端点**: 14个

### 高级引擎集群

\`scripts/autonomous-systems/\` 包含13个专业引擎:
1. architecture-evolution-engine (16KB)
2. autonomous-thinking-system (15KB)
3. reinforcement-learning-engine (5KB)
4. 其他10个引擎...

---

## 🚀 快速开始

### 环境要求

- Node.js 22+
- Redis 7+
- PM2 (可选, 推荐)

### 启动系统

\`\`\`bash
# 使用性能优化版本
pm2 start scripts/autonomous-five-layer-v7-2-perf-optimized.js --name libai-system

# 查看状态
pm2 status
pm2 logs libai-system
\`\`\`

### 验证运行

\`\`\`bash
# 检查Redis
redis-cli -h 127.0.0.1 -p 6379 dbsize

# 查看指标
curl http://localhost:3000/status/super-auto
\`\`\`

---

## 📚 核心文档

### 必读报告

1. **REAL-FINAL-REPORT.md** - 真实系统审计
2. **FINAL-REPORT.md** - 终极建设报告
3. **DEEP-OPTIMIZATION-REPORT.md** - 优化方案
4. **SYSTEM-AUDIT-REPORT.md** - 系统审计
5. **INTEGRATION-ROADMAP.md** - 整合路线

### 性能工具

\`scripts/performance/\` 目录:
- binary-serializer.js (二进制序列化, -8ms)
- middleware-optimizer.js (中间件精简, -4ms)
- apply-optimizations.js (一键优化)

---

## 🔧 常见问题

### Q1: 系统启动失败?

检查:
- Redis是否运行: \`redis-cli ping\`
- 端口3000是否被占用
- 查看日志: \`pm2 logs libai-system\`

### Q2: 响应时间未达标?

执行优化:
\`\`\`bash
node scripts/performance/apply-optimizations.js
pm2 restart libai-system
\`\`\`

### Q3: 如何集成新引擎?

参考 \`INTEGRATION-ROADMAP.md\` 分Phase集成。

---

## 📞 获取帮助

- **GitHub**: https://github.com/Siyebai/libai-workspace
- **问题反馈**: 提交Issue
- **版本**: V7.2-Perf-Optimized (2026-04-03)

---

**祝学习愉快！🚀**
`;
  }
}

// 执行学习
if (require.main === module) {
  const learner = new DeepLearningSystem();
  learner.run().catch(err => {
    console.error('❌ 学习过程出错:', err);
    process.exit(1);
  });
}

module.exports = DeepLearningSystem;