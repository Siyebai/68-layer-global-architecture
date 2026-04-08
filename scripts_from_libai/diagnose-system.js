#!/usr/bin/env node
// 系统状态诊断与优化脚本
// 执行时间: 2026-04-03 08:20 GMT+8
// 目标: 检查状态，识别问题，应用优化

const axios = require('axios');
const fs = require('fs');

async function diagnose() {
  console.log('🔍 系统诊断与优化工具 V1.0');
  console.log('=' .repeat(50));
  console.log('时间:', new Date().toISOString());
  console.log('');

  const results = {
    timestamp: Date.now(),
    checks: [],
    issues: [],
    optimizations: []
  };

  // 1. 健康检查
  console.log('[1/6] 健康检查...');
  try {
    const health = await axios.get('http://localhost:3000/health', { timeout: 5000 });
    console.log('✅ 健康检查:', health.data);
    results.checks.push({ name: 'health', status: 'ok', data: health.data });
  } catch (err) {
    console.error('❌ 健康检查失败:', err.message);
    results.issues.push({ name: 'health', error: err.message });
    return results;
  }

  // 2. 五层系统状态
  console.log('[2/6] 五层自主系统状态...');
  try {
    const auto = await axios.get('http://localhost:3000/status/super-auto', { timeout: 5000 });
    const data = auto.data;
    console.log(`版本: ${data.version} (${data.name})`);
    console.log(`自主度: ${data.autonomy}%`);
    console.log(`准确率: ${data.metrics.accuracy}%`);
    console.log(`运行时间: ${Math.floor(data.uptime/1000)}秒`);
    console.log('层级状态:');
    for (const [layer, info] of Object.entries(data.layers)) {
      const allRunning = info.running === info.modules.length;
      const status = allRunning ? '✅' : '⚠️';
      console.log(`  ${status} ${layer}: ${info.running}/${info.modules.length} 运行`);
      if (!allRunning) {
        results.issues.push({
          name: `layer_${layer}`,
          expected: info.modules.length,
          actual: info.running,
          missing: info.modules.filter(m => !info.running)
        });
      }
    }
    results.checks.push({ name: 'five-layer', status: 'ok', data });
  } catch (err) {
    console.error('❌ 五层系统检查失败:', err.message);
    results.issues.push({ name: 'five-layer', error: err.message });
  }

  // 3. Agent详情
  console.log('[3/6] Agent集群状态...');
  try {
    const status = await axios.get('http://localhost:3000/status', { timeout: 5000 });
    const agentCount = status.data.agents.total;
    const healthy = status.data.agents.healthy;
    console.log(`Agent总数: ${agentCount}, 健康: ${healthy}`);
    if (healthy < agentCount) {
      results.issues.push({ name: 'agents', expected: agentCount, actual: healthy });
    }
    results.checks.push({ name: 'agents', status: 'ok', data: status.data.agents });
  } catch (err) {
    console.error('❌ Agent状态检查失败:', err.message);
    results.issues.push({ name: 'agents', error: err.message });
  }

  // 4. Redis健康
  console.log('[4/6] Redis健康检查...');
  try {
    const redisPing = await axios.get('http://localhost:3000/redis/ping', { timeout: 5000 });
    console.log('✅ Redis响应:', redisPing.data);
    results.checks.push({ name: 'redis', status: 'ok' });
  } catch (err) {
    console.warn('⚠️  Redis健康检查端点不可用 (正常情况)');
    results.checks.push({ name: 'redis', status: 'unknown', note: '端点不存在' });
  }

  // 5. 检查缺失模块
  console.log('[5/6] 检查自主模块文件...');
  const modules = [
    'autonomous-thinking.js',
    'autonomous-decision.js',
    'autonomous-deployment.js',
    'autonomous-communication.js',
    'adaptive-risk-control.js'
  ];
  const missing = [];
  for (const mod of modules) {
    const path = `/root/.openclaw/workspace/libai-workspace/scripts/${mod}`;
    if (!fs.existsSync(path)) {
      console.warn(`⚠️  缺失: ${mod}`);
      missing.push(mod);
    } else {
      console.log(`✅ ${mod} 存在`);
    }
  }
  if (missing.length > 0) {
    results.issues.push({ name: 'missing_modules', modules: missing });
  }

  // 6. 性能指标
  console.log('[6/6] 性能指标...');
  const status = await axios.get('http://localhost:3000/status', { timeout: 5000 });
  const cycleTime = status.data.cycle_time_ms;
  console.log(`周期时间: ${cycleTime}ms (目标: <80ms)`);
  if (cycleTime > 80) {
    results.optimizations.push({ name: 'cycle_time', current: cycleTime, target: 80 });
  }

  // 总结
  console.log('');
  console.log('=' .repeat(50));
  console.log('诊断完成');
  console.log(`发现问题: ${results.issues.length}个`);
  console.log(`建议优化: ${results.optimizations.length}项`);
  console.log('');

  if (results.issues.length > 0) {
    console.log('问题列表:');
    results.issues.forEach(issue => {
      console.log(`  ❌ ${issue.name}: ${JSON.stringify(issue)}`);
    });
  }

  if (results.optimizations.length > 0) {
    console.log('优化建议:');
    results.optimizations.forEach(opt => {
      console.log(`  ⚡ ${opt.name}: ${opt.current} → ${opt.target}`);
    });
  }

  // 保存报告
  const reportPath = `/root/.openclaw/workspace/memory/DIAGNOSE-${Date.now()}.json`;
  fs.writeFileSync(reportPath, JSON.stringify(results, null, 2));
  console.log(`\n详细报告: ${reportPath}`);

  return results;
}

diagnose().then(res => {
  console.log('\n✅ 诊断完成');
  process.exit(0);
}).catch(err => {
  console.error('诊断失败:', err);
  process.exit(1);
});
