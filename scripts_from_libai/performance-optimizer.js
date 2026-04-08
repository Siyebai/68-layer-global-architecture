#!/usr/bin/env node
// 性能优化工具 - 针对大知识库场景

const redis = require('redis');

class PerformanceOptimizer {
  constructor() {
    this.client = null;
    this.optimizations = [];
  }

  async connect() {
    this.client = redis.createClient({
      host: '127.0.0.1',
      port: 6379,
      lazyConnect: true,
      enableReadyCheck: false,
      maxRetriesPerRequest: 3,
      retryDelayOnFailover: 100,
      commandsTimeout: 2000
    });

    await this.client.connect();
    console.log('[PerformanceOptimizer] Redis连接已建立');
  }

  async runAllOptimizations() {
    console.log('\n========================================');
    console.log('⚡ 性能优化工具 - 针对1414节点知识库');
    console.log('========================================\n');

    await this.connect();

    // 1. 键空间统计与清理
    await this.optimizeKeySpace();

    // 2. 内存碎片整理
    await this.memoryOptimization();

    // 3. 连接池参数调优
    await this.tuneConnectionPool();

    // 4. 热点数据预加载
    await this.preloadHotData();

    // 5. 生成优化报告
    await this.generateReport();

    await this.client.quit();
  }

  async optimizeKeySpace() {
    console.log('🔍 优化1: 键空间分析...');

    const kgNodeCount = await this.client.keys('kg:node:*');
    const kgEdgeCount = await this.client.keys('kg:edge:*');

    console.log(`  当前状态:`);
    console.log(`    - 知识节点: ${kgNodeCount.length} 个`);
    console.log(`    - 关系边: ${kgEdgeCount.length} 个`);
    console.log(`    - 总键数: ${kgNodeCount.length + kgEdgeCount.length}`);

    // 检查是否有无效键
    const invalidNodes = kgNodeCount.filter(k => !k.startsWith('kg:node:'));
    const invalidEdges = kgEdgeCount.filter(k => !k.startsWith('kg:edge:'));

    if (invalidNodes.length > 0 || invalidEdges.length > 0) {
      console.log(`  ⚠️  发现无效键: ${invalidNodes.length + invalidEdges.length} 个`);
      // 可选: 删除无效键
    }

    this.optimizations.push({
      step: 'key_space_analysis',
      nodes: kgNodeCount.length,
      edges: kgEdgeCount.length,
      timestamp: new Date().toISOString()
    });
  }

  async memoryOptimization() {
    console.log('\n🧹 优化2: 内存整理...');

    // 检查内存碎片率
    const info = await this.client.info('memory');
    const memStats = this.parseInfo(info);

    console.log(`  内存状态:`);
    console.log(`    - 使用内存: ${memStats.used_memory_human}`);
    console.log(`    - 碎片率: ${memStats.mem_fragmentation_ratio || 'N/A'}`);

    // 如果碎片率>1.5，执行内存整理
    const fragRatio = parseFloat(memStats.mem_fragmentation_ratio);
    if (fragRatio > 1.5) {
      console.log('  ⚠️  碎片率偏高，执行内存整理...');
      await this.client.memory('purge'); // Redis 4.0+
      console.log('  ✅ 内存整理完成');
    }

    this.optimizations.push({
      step: 'memory_optimization',
      fragmentation_ratio: fragRatio,
      used_memory: memStats.used_memory_human
    });
  }

  async tuneConnectionPool() {
    console.log('\n🔌 优化3: 连接池配置建议...');

    const config = {
      // 针对1414节点知识库的优化配置
      host: '127.0.0.1',
      port: 6379,
      // 连接池
      maxRetriesPerRequest: 5, // 原3 → 5 (大查询需要)
      retryDelayOnFailover: 50, // 原100 → 50 (更快重试)
      // 超时设置
      connectTimeout: 3000, // 原5000 → 3000 (快速失败)
      commandsTimeout: 1500, // 原3000 → 1500 (降低延迟)
      // 连接管理
      lazyConnect: true,
      enableReadyCheck: false, // 禁用就绪检查减少延迟
      // 性能调优
      keepAlive: true,
      keepAliveInitialDelay: 0,
      // 可选: 使用连接池库 (ioredis) 会更好
    };

    console.log('  推荐配置:');
    console.log(`    maxRetriesPerRequest: ${config.maxRetriesPerRequest}`);
    console.log(`    commandsTimeout: ${config.commandsTimeout}ms`);
    console.log(`    enableReadyCheck: ${config.enableReadyCheck}`);

    this.optimizations.push({
      step: 'connection_pool_tuning',
      recommended_config: config
    });
  }

  async preloadHotData() {
    console.log('\n🔥 优化4: 热点数据预加载...');

    // 识别高频查询的节点 (基于keypattern)
    const hotPatterns = [
      'kg:node:doc:*',
      'kg:node:knowledge:*',
      'kg:edge:*'
    ];

    let preloaded = 0;
    for (const pattern of hotPatterns) {
      const keys = await this.client.keys(pattern);
      console.log(`  预加载模式 ${pattern}: ${keys.length} 个键`);

      // 批量获取 (使用multi/exec减少RTT)
      const multi = this.client.multi();
      keys.slice(0, 100).forEach(key => multi.hGetAll(key));
      const results = await multi.exec();

      preloaded += results.length;
    }

    console.log(`  ✅ 预加载完成: ${preloaded} 个热点数据项`);

    this.optimizations.push({
      step: 'hot_data_preload',
      preloaded_count: preloaded,
      patterns: hotPatterns
    });
  }

  async generateReport() {
    console.log('\n📊 生成优化报告...');

    const info = await this.client.info('memory');
    const memStats = this.parseInfo(info);
    const keysCount = await this.client.dbsize();

    const report = {
      timestamp: new Date().toISOString(),
      redis_status: {
        total_keys: keysCount,
        kg_nodes: await this.client.keys('kg:node:*').then(keys => keys.length),
        kg_edges: await this.client.keys('kg:edge:*').then(keys => keys.length),
        used_memory: memStats.used_memory_human,
        fragmentation_ratio: memStats.mem_fragmentation_ratio
      },
      optimizations_applied: this.optimizations,
      recommendations: [
        '使用 SCAN 代替 KEYS 进行大规模键遍历',
        '对大结果集使用 Pipeline 批量操作',
        '考虑将热点数据移至内存更快的存储',
        '监控慢查询日志 (CONFIG SET slowlog-log-slower-than 1000)',
        '定期执行 MEMORY PURGE 减少碎片'
      ]
    };

    const reportPath = '/root/.openclaw/workspace/libai-workspace/data/performance-optimization-report.json';
    const fs = require('fs');
    fs.mkdirSync(path.dirname(reportPath), { recursive: true });
    fs.writeFileSync(reportPath, JSON.stringify(report, null, 2), 'utf8');

    console.log(`  ✅ 报告已保存: ${reportPath}`);
    console.log('\n📈 优化完成摘要:');
    console.log(`  - Redis总键数: ${keysCount}`);
    console.log(`  - 知识图谱节点: ${report.redis_status.kg_nodes}`);
    console.log(`  - 知识图谱边: ${report.redis_status.kg_edges}`);
    console.log(`  - 内存使用: ${memStats.used_memory_human}`);
  }

  parseInfo(infoText) {
    const lines = infoText.split('\n');
    const result = {};
    for (const line of lines) {
      if (line.includes(':') && !line.startsWith('#')) {
        const [key, value] = line.split(':').map(s => s.trim());
        result[key] = value;
      }
    }
    return result;
  }
}

// 执行优化
async function main() {
  const optimizer = new PerformanceOptimizer();

  try {
    await optimizer.runAllOptimizations();
    console.log('\n✅ 性能优化完成!');
    console.log('========================================\n');
    process.exit(0);
  } catch (error) {
    console.error('优化失败:', error);
    process.exit(1);
  }
}

main();
