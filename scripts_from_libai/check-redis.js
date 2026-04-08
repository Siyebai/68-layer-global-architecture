#!/usr/bin/env node
// Redis连接诊断与修复脚本

const { execSync } = require('child_process');
const Redis = require('ioredis');

console.log('🔍 Redis连接诊断工具 V1.0');
console.log('=' .repeat(50));

// 1. 检查Redis服务状态
console.log('[1] 检查Redis服务...');
try {
  const ping = execSync('redis-cli ping').toString().trim();
  console.log(`✅ Redis ping: ${ping}`);
} catch (err) {
  console.error('❌ Redis服务未运行或不可达');
  process.exit(1);
}

// 2. 测试直接连接
console.log('\n[2] 测试Node.js Redis连接...');
const client = new Redis({
  host: '127.0.0.1',
  port: 6379,
  maxRetriesPerRequest: 3,
  retryDelayOnFailover: 100,
  lazyConnect: true
});

client.on('error', (err) => console.error('❌ Redis客户端错误:', err.message));
client.on('connect', () => console.log('✅ Redis客户端连接成功'));
client.on('ready', () => console.log('✅ Redis客户端就绪'));

client.connect().then(async () => {
  try {
    // 3. 测试基本操作
    console.log('\n[3] 测试Redis操作...');
    await client.set('test:key', 'test:value');
    const val = await client.get('test:key');
    console.log(`✅ 读写测试: ${val}`);
    await client.del('test:key');

    // 4. 检查配置
    console.log('\n[4] 检查Redis配置...');
    const info = await client.info();
    const lines = info.split('\n');
    const connected = lines.find(l => l.startsWith('connected_clients:'));
    const used = lines.find(l => l.startsWith('used_memory_human:'));
    console.log(`   连接数: ${connected?.split(':')[1]?.trim() || 'N/A'}`);
    console.log(`   内存使用: ${used?.split(':')[1]?.trim() || 'N/A'}`);

    console.log('\n✅ Redis连接正常');
    console.log('=' .repeat(50));
    process.exit(0);
  } catch (err) {
    console.error('❌ Redis操作失败:', err.message);
    process.exit(1);
  } finally {
    client.quit();
  }
}).catch(err => {
  console.error('❌ Redis连接失败:', err.message);
  process.exit(1);
});
