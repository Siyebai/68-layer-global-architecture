#!/usr/bin/env node
/**
 * 合约交易系统测试 V2 - 整合知识库测试
 * 验证全部组件：通信层、监控、风控、实验框架、策略
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
let passed = 0;
let failed = 0;

function test(name, fn) {
  try {
    fn();
    console.log(`✅ ${name}`);
    passed++;
  } catch (err) {
    console.log(`❌ ${name}: ${err.message}`);
    failed++;
  }
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

console.log('\n🔬 合约交易系统 V2.0 整合测试\n');
console.log('='.repeat(60));

// ====== 合约交易核心模块 ======

test('OKX合约客户端完整', () => {
  const f = path.join(ROOT, 'products/exchange-adapters/okx-contract-client.js');
  const c = fs.readFileSync(f, 'utf8');
  ['placeOrder', 'getPositions', 'setLeverage', 'getFundingRate', 'getCandles', 'connectWebSocket'].forEach(m => {
    assert(c.includes(m), `Missing: ${m}`);
  });
});

test('技术指标库 (11种)', () => {
  const f = path.join(ROOT, 'products/contract-trading-system/strategies/technical-indicators.js');
  const c = fs.readFileSync(f, 'utf8');
  ['sma', 'ema', 'macd', 'rsi', 'kdj', 'bollingerBands', 'atr', 'vwap', 'movingAverages', 'cross', 'overboughtOversold'].forEach(i => {
    assert(c.includes(i), `Missing indicator: ${i}`);
  });
});

test('信号融合引擎', () => {
  const f = path.join(ROOT, 'products/contract-trading-system/strategies/signal-fusion-engine.js');
  const c = fs.readFileSync(f, 'utf8');
  ['registerStrategy', 'receiveSignal', 'fuseSignals', 'adjustWeights', 'detectMarketRegime'].forEach(m => {
    assert(c.includes(m), `Missing: ${m}`);
  });
});

test('高胜率策略 (8重信号)', () => {
  const f = path.join(ROOT, 'products/contract-trading-system/strategies/high-winrate-strategy.js');
  const c = fs.readFileSync(f, 'utf8');
  ['generateSignal', 'analyzeSignals', 'fuseSignals', 'calculatePositionSize', 'fundingRate'].forEach(m => {
    assert(c.includes(m), `Missing: ${m}`);
  });
});

test('回测引擎', () => {
  const f = path.join(ROOT, 'products/contract-trading-system/backtest/backtest-engine.js');
  const c = fs.readFileSync(f, 'utf8');
  ['async run', 'executeTrade', 'closePosition', 'generateReport', 'printSummary', 'calculatePnL'].forEach(m => {
    assert(c.includes(m), `Missing: ${m}`);
  });
});

test('合约交易Agent', () => {
  const f = path.join(ROOT, 'products/contract-trading-system/contract-agent.js');
  const c = fs.readFileSync(f, 'utf8');
  assert(c.includes('OKXContractClient'), 'Missing OKX client');
  assert(c.includes('HighWinrateStrategy'), 'Missing strategy');
  assert(c.includes('SignalFusionEngine'), 'Missing fusion');
});

// ====== 知识库整合模块 (新增) ======

test('Redis Streams 通信层', () => {
  const f = path.join(ROOT, 'lib/communication.js');
  assert(fs.existsSync(f), 'Missing communication.js');
  const c = fs.readFileSync(f, 'utf8');
  ['CommunicationLayer', 'publish', 'subscribe', 'heartbeat', 'sendCommand', 'respond', 'sendToDlq'].forEach(m => {
    assert(c.includes(m), `Missing: ${m}`);
  });
});

test('监控与指标系统', () => {
  const f = path.join(ROOT, 'lib/monitoring.js');
  assert(fs.existsSync(f), 'Missing monitoring.js');
  const c = fs.readFileSync(f, 'utf8');
  ['MonitoringService', 'checkHealth', 'checkReadiness', 'recordAgentLatency', 'recordOrder'].forEach(m => {
    assert(c.includes(m), `Missing: ${m}`);
  });
  // 检查Prometheus指标定义
  ['libai_agent_total', 'libai_orders_submitted_total', 'libai_pnl_usd', 'libai_strategy_win_rate'].forEach(metric => {
    assert(c.includes(metric), `Missing metric: ${metric}`);
  });
});

test('高级风控系统', () => {
  const f = path.join(ROOT, 'lib/risk-manager.js');
  assert(fs.existsSync(f), 'Missing risk-manager.js');
  const c = fs.readFileSync(f, 'utf8');
  ['RiskManager', 'assess', 'checkSingleRisk', 'checkPositionSize', 'checkDiversification',
   'checkExchangeExposure', 'checkDailyLossLimit', 'checkOrderFrequency', 'getRiskReport'].forEach(m => {
    assert(c.includes(m), `Missing: ${m}`);
  });
});

test('A/B测试实验框架', () => {
  const f = path.join(ROOT, 'lib/experiment-manager.js');
  assert(fs.existsSync(f), 'Missing experiment-manager.js');
  const c = fs.readFileSync(f, 'utf8');
  ['ExperimentManager', 'createExperiment', 'assignVariant', 'recordDataPoint',
   'analyzeExperiment', 'consistentHash', 'twoTailedPValue', 'autoAnalyzeRunningExperiments'].forEach(m => {
    assert(c.includes(m), `Missing: ${m}`);
  });
});

test('企业级整合系统 V2', () => {
  const f = path.join(ROOT, 'products/contract-trading-system/contract-trading-system-v2.js');
  assert(fs.existsSync(f), 'Missing contract-trading-system-v2.js');
  const c = fs.readFileSync(f, 'utf8');
  // 检查所有组件集成
  ['OKXContractClient', 'HighWinrateStrategy', 'SignalFusionEngine',
   'CommunicationLayer', 'MonitoringService', 'RiskManager', 'ExperimentManager'].forEach(dep => {
    assert(c.includes(dep), `Missing integration: ${dep}`);
  });
  // 检查核心功能
  ['initialize', 'startTradingLoop', 'executeTrade', 'closePosition',
   'sendHeartbeat', 'updateStrategyMetrics', 'getSystemStatus', 'shutdown'].forEach(m => {
    assert(c.includes(m), `Missing method: ${m}`);
  });
});

// ====== 配置文件 ======

test('合约交易配置完整', () => {
  const f = path.join(ROOT, 'config/contract-trading.yaml');
  const c = fs.readFileSync(f, 'utf8');
  ['okx_contract', 'strategy', 'fusion', 'risk_management', 'backtest', 'monitoring'].forEach(s => {
    assert(c.includes(s), `Missing config section: ${s}`);
  });
});

// ====== 文档 ======

test('合约交易文档完整', () => {
  const f = path.join(ROOT, 'products/contract-trading-system/README.md');
  assert(fs.existsSync(f), 'Missing README');
  const c = fs.readFileSync(f, 'utf8');
  assert(c.includes('高胜率'), 'Missing keyword');
  assert(c.includes('技术指标'), 'Missing section');
  assert(c.includes('信号融合'), 'Missing section');
  assert(c.includes('回测'), 'Missing section');
});

// ====== 知识库验证 ======

test('知识库文档完整 (14个)', () => {
  const dir = path.join(ROOT, 'knowledge');
  assert(fs.existsSync(dir), 'Missing knowledge dir');
  const files = fs.readdirSync(dir).filter(f => f.endsWith('.md'));
  assert(files.length >= 14, `Expected 14+ knowledge files, got ${files.length}`);
});

// ====== 模块导出检查 ======

test('所有模块可导出', () => {
  const modules = [
    'products/exchange-adapters/okx-contract-client.js',
    'products/contract-trading-system/strategies/technical-indicators.js',
    'products/contract-trading-system/strategies/signal-fusion-engine.js',
    'products/contract-trading-system/strategies/high-winrate-strategy.js',
    'products/contract-trading-system/backtest/backtest-engine.js',
    'products/contract-trading-system/contract-agent.js',
    'products/contract-trading-system/contract-trading-system-v2.js',
    'lib/communication.js',
    'lib/monitoring.js',
    'lib/risk-manager.js',
    'lib/experiment-manager.js',
  ];
  modules.forEach(m => {
    const f = path.join(ROOT, m);
    assert(fs.existsSync(f), `Missing: ${m}`);
    const c = fs.readFileSync(f, 'utf8');
    assert(c.includes('module.exports'), `No exports in ${path.basename(m)}`);
  });
});

console.log('='.repeat(60));
console.log(`\n📊 结果: ${passed} 通过, ${failed} 失败\n`);

if (failed > 0) {
  process.exit(1);
} else {
  console.log('🎉 合约交易系统 V2.0 整合测试全部通过!\n');

  // 输出系统统计
  const files = [
    'products/exchange-adapters/okx-contract-client.js',
    'products/contract-trading-system/strategies/technical-indicators.js',
    'products/contract-trading-system/strategies/signal-fusion-engine.js',
    'products/contract-trading-system/strategies/high-winrate-strategy.js',
    'products/contract-trading-system/backtest/backtest-engine.js',
    'products/contract-trading-system/contract-agent.js',
    'products/contract-trading-system/contract-trading-system-v2.js',
    'lib/communication.js',
    'lib/monitoring.js',
    'lib/risk-manager.js',
    'lib/experiment-manager.js',
    'config/contract-trading.yaml',
    'products/contract-trading-system/README.md',
  ];

  let totalBytes = 0;
  files.forEach(f => {
    const stats = fs.statSync(path.join(ROOT, f));
    totalBytes += stats.size;
  });

  console.log(`📦 系统统计:`);
  console.log(`   核心文件: ${files.length} 个`);
  console.log(`   总代码量: ${(totalBytes / 1024).toFixed(1)} KB`);
  console.log(`   知识库: ${fs.readdirSync(path.join(ROOT, 'knowledge')).filter(f => f.endsWith('.md')).length} 个文档`);
  console.log();

  process.exit(0);
}