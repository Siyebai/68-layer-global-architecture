#!/usr/bin/env node
// 自主系统监控器 - 每5分钟检查系统状态

const http = require('http');

const MONITOR_INTERVAL = 5 * 60 * 1000; // 5分钟

function checkSystem() {
  console.log(`\n[${new Date().toISOString()}] 自主系统健康检查`);
  
  // 检查健康接口
  http.get('http://localhost:3000/health', (res) => {
    let data = '';
    res.on('data', chunk => data += chunk);
    res.on('end', () => {
      try {
        const health = JSON.parse(data);
        console.log('健康状态:', health.status);
        console.log('Redis:', health.redis);
        console.log('Agents:', health.agents);
        
        if (health.status !== 'ok') {
          console.error('❌ 系统异常，需要人工干预');
          // 可以添加自动重启逻辑
        } else {
          console.log('✅ 系统运行正常');
        }
      } catch (err) {
        console.error('解析响应失败:', err.message);
      }
    });
  }).on('error', (err) => {
    console.error('健康检查失败:', err.message);
  });

  // 检查状态接口
  setTimeout(() => {
    http.get('http://localhost:3000/status', (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const status = JSON.parse(data);
          console.log('\n核心指标:');
          console.log('  学习周期:', status.metrics.learningCycles);
          console.log('  进化代数:', status.evolution.generation || status.metrics.evolutionGenerations);
          console.log('  迭代次数:', status.metrics.iterationsCompleted);
          console.log('  知识库大小:', status.engines.learning);
          console.log('  消息处理:', status.metrics.messagesProcessed);
          console.log('  错误数:', status.metrics.errors);
          
          // 如果指标长时间为0，发送告警
          if (status.metrics.learningCycles === 0 && status.uptime > 3600000) {
            console.warn('⚠️  警告: 1小时过去，学习周期仍为0，可能存在问题');
          }
        } catch (err) {
          console.error('解析状态失败:', err.message);
        }
      });
    }).on('error', (err) => {
      console.error('状态检查失败:', err.message);
    });
  }, 1000);
}

// 立即执行一次
checkSystem();

// 设置定时器
setInterval(checkSystem, MONITOR_INTERVAL);

console.log(`自主监控器已启动，每5分钟检查一次`);
console.log('按 Ctrl+C 退出');
