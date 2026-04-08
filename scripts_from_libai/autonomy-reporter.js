#!/usr/bin/env node
// 自主系统报告生成器 - 每小时生成状态报告

const fs = require('fs');
const path = require('path');
const http = require('http');

function generateReport() {
  console.log(`\n[${new Date().toISOString()}] 生成自主系统报告`);
  
  // 获取系统状态
  http.get('http://localhost:3000/status', (res) => {
    let data = '';
    res.on('data', chunk => data += chunk);
    res.on('end', () => {
      try {
        const status = JSON.parse(data);
        
        const report = {
          timestamp: new Date().toISOString(),
          system: {
            version: status.version,
            intelligence_level: status.intelligence_level,
            agents_total: status.agents_total,
            uptime_seconds: Math.floor((Date.now() - status.uptime) / 1000)
          },
          metrics: status.metrics,
          engines: status.engines,
          health: {
            agents_healthy: status.agents.healthy,
            agents_total: status.agents.total,
            redis_status: status.redis
          }
        };
        
        // 保存报告
        const reportDir = 'reports/autonomy';
        if (!fs.existsSync(reportDir)) {
          fs.mkdirSync(reportDir, { recursive: true });
        }
        
        const filename = path.join(reportDir, `autonomy-report-${new Date().toISOString().split('T')[0]}.json`);
        fs.writeFileSync(filename, JSON.stringify(report, null, 2));
        
        console.log(`✅ 报告已保存: ${filename}`);
        
        // 输出摘要
        console.log('\n=== 系统状态摘要 ===');
        console.log(`运行时间: ${report.system.uptime_seconds}秒`);
        console.log(`智能等级: L${report.system.intelligence_level}`);
        console.log(`Agent状态: ${report.health.agents_healthy}/${report.health.agents_total}`);
        console.log(`Redis: ${report.health.redis_status}`);
        console.log('\n核心指标:');
        console.log(`  学习周期: ${report.metrics.learningCycles}`);
        console.log(`  进化代数: ${report.metrics.evolutionGenerations}`);
        console.log(`  迭代次数: ${report.metrics.iterationsCompleted}`);
        console.log(`  知识库大小: ${report.engines.learning} 条记录`);
        console.log(`  消息处理: ${report.metrics.messagesProcessed}`);
        console.log(`  交易执行: ${report.metrics.tradesExecuted}`);
        console.log(`  系统利润: $${report.metrics.profit.toFixed(2)}`);
        
      } catch (err) {
        console.error('生成报告失败:', err.message);
      }
    });
  }).on('error', (err) => {
    console.error('获取状态失败:', err.message);
  });
}

// 立即执行
generateReport();

// 每小时执行
setInterval(generateReport, 60 * 60 * 1000);

console.log('自主报告生成器已启动，每小时生成一次报告');
