#!/usr/bin/env node
// 知识库系统集成诊断

const { execSync } = require('child_process');

console.log('🔍 知识库系统集成诊断');
console.log('='.repeat(50));

// 1. 检查模块文件
console.log('[1] 检查核心模块文件...');
const requiredFiles = [
  'lib/brain/knowledge-graph-api.js',
  'lib/brain/qa-system.js',
  'lib/brain/auto-learning.js',
  'lib/brain/index.js',
  'routes/knowledge.js'
];

let allFilesExist = true;
for (const file of requiredFiles) {
  const exists = execSync(`test -f /root/.openclaw/workspace/libai-workspace/${file} && echo "YES" || echo "NO"`).toString().trim();
  const status = exists === 'YES' ? '✅' : '❌';
  console.log(`  ${status} ${file}`);
  if (exists !== 'YES') allFilesExist = false;
}

if (!allFilesExist) {
  console.error('❌ 部分文件缺失，无法继续');
  process.exit(1);
}

// 2. 检查依赖
console.log('\n[2] 检查Node.js依赖...');
try {
  execSync('npm list uuid --json > /dev/null 2>&1');
  console.log('  ✅ uuid 已安装');
} catch (err) {
  console.log('  ⚠️ uuid 未安装，尝试安装...');
  execSync('npm install uuid --no-save', { stdio: 'inherit' });
}

// 3. 检查Redis连接
console.log('\n[3] 检查Redis连接...');
try {
  const ping = execSync('redis-cli ping').toString().trim();
  console.log(`  ✅ Redis ping: ${ping}`);
} catch (err) {
  console.error('  ❌ Redis不可达');
  process.exit(1);
}

// 4. 测试知识系统加载
console.log('\n[4] 测试知识系统加载...');
(async () => {
  try {
    const { KnowledgeSystem } = require('../lib/brain/index');
    const ks = new KnowledgeSystem({ host: '127.0.0.1', port: 6379 });
    await ks.initialize();
    console.log('  ✅ 知识系统初始化成功');
    
    // 5. 测试基本功能
    console.log('\n[5] 测试基本功能...');
    
    // 添加测试实体
    await ks.addEntity('test:entity', 'test', { name: '测试实体', description: '这是一个测试' });
    console.log('  ✅ 添加实体成功');
    
    // 搜索
    const searchResults = await ks.search('测试');
    console.log(`  ✅ 搜索成功: 找到 ${searchResults.length} 条结果`);
    
    // 问答
    const answer = await ks.answer('什么是测试实体?');
    console.log(`  ✅ 问答成功: ${answer.success ? '有结果' : '无结果'}`);
    
    // 统计
    const stats = await ks.getStatus();
    console.log(`  ✅ 系统状态: 组件=${Object.keys(stats.components).filter(k=>stats.components[k]).length}/3`);
    
    await ks.shutdown();
    
    console.log('\n✅ 所有检查通过！知识库系统已就绪');
    
  } catch (err) {
    console.error('  ❌ 知识系统加载失败:', err.message);
    console.error('  堆栈:', err.stack);
    process.exit(1);
  }
  
  console.log('='.repeat(50));
})();
