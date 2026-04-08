#!/usr/bin/env node
// V7.2合约交易集成补丁应用器

const fs = require('fs');
const path = require('path');

const V72_FILE = path.join(__dirname, '..', 'scripts', 'autonomous-five-layer-v7-2.js');

console.log('==========================================');
console.log('  V7.2 合约交易集成补丁');
console.log('==========================================');

try {
  // 读取原文件
  const original = fs.readFileSync(V72_FILE, 'utf8');
  console.log('✅ 读取V7.2文件成功 (%d bytes)', original.length);

  // 1. 在构造函数中添加 contractAdapter 属性
  const afterConstructor = original.replace(
    /(this\.swotAnalyzer = \{[^}]+\};)/,
    `$1
    
    // Phase 1: 合约交易系统集成 (第7轮)
    this.contractAdapter = null;  // 合约交易适配器`
  );
  console.log('✅ Step 1: 添加 contractAdapter 属性');

  // 2. 在 start() 方法开头添加初始化代码
  const afterStartInit = afterConstructor.replace(
    /(async start\(\) \{[^}]*console\.log\('\[V7\.2\] 五层认知自主系统 V7\.2 启动...'\);)/,
    `$1
    
    // 初始化合约交易系统
    console.log('[V7.2] 初始化合约交易系统...');
    try {
      const ContractAdapter = require('./contract-integration/contract-adapter');
      this.contractAdapter = new ContractAdapter(this);
      await this.contractAdapter.initialize();
      await this.contractAdapter.startAll();
      console.log('[V7.2] ✅ 合约交易系统已集成');
    } catch (e) {
      console.error('[V7.2] ❌ 合约交易集成失败:', e.message);
    }`
  );
  console.log('✅ Step 2: 在 start() 中添加初始化');

  // 3. 在 getStatus() 返回对象中添加 contractTrading 字段
  const afterStatus = afterStartInit.replace(
    /(metrics: \{[\s\S]*?\},)/,
    `$1
      contractTrading: this.contractAdapter ? this.contractAdapter.getStatus() : { running: false },`
  );
  console.log('✅ Step 3: 在 getStatus() 中添加状态');

  // 备份原文件
  const backupFile = V72_FILE + '.backup-' + Date.now();
  fs.writeFileSync(backupFile, original);
  console.log('✅ 备份文件: %s', backupFile);

  // 写入修改后的文件
  fs.writeFileSync(V72_FILE, afterStatus);
  console.log('✅ V7.2文件修改完成');

  console.log('');
  console.log('==========================================');
  console.log('  集成完成！');
  console.log('==========================================');
  console.log('修改内容:');
  console.log('  1. 构造函数添加 this.contractAdapter');
  console.log('  2. start() 方法添加合约交易初始化');
  console.log('  3. getStatus() 添加 contractTrading 状态');
  console.log('');
  console.log('下一步: 重启系统测试');
  console.log('==========================================');

} catch (error) {
  console.error('❌ 错误:', error.message);
  process.exit(1);
}
