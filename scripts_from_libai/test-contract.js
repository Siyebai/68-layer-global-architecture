#!/usr/bin/env node

/**
 * 合约交易系统测试
 * 验证合约交易模块的完整性和功能
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

console.log('\n🔬 合约交易系统核心测试\n');
console.log('='.repeat(50));

// 1. 文件完整性检查
test('合约交易核心文件存在', () => {
  const files = [
    'products/exchange-adapters/okx-contract-client.js',
    'products/contract-trading-system/strategies/technical-indicators.js',
    'products/contract-trading-system/strategies/signal-fusion-engine.js',
    'products/contract-trading-system/strategies/high-winrate-strategy.js',
    'products/contract-trading-system/backtest/backtest-engine.js',
    'products/contract-trading-system/contract-agent.js',
    'config/contract-trading.yaml',
  ];
  files.forEach(file => {
    const fullPath = path.join(ROOT, file);
    assert(fs.existsSync(fullPath), `Missing: ${file}`);
  });
});

// 2. OKX合约客户端语法检查
test('OKX合约客户端语法正确', () => {
  const file = path.join(ROOT, 'products/exchange-adapters/okx-contract-client.js');
  const content = fs.readFileSync(file, 'utf8');
  assert(content.includes('class OKXContractClient'), 'Missing class');
  assert(content.includes('placeOrder'), 'Missing placeOrder method');
  assert(content.includes('getPositions'), 'Missing getPositions method');
  assert(content.includes('setLeverage'), 'Missing setLeverage method');
  assert(content.includes('connectWebSocket'), 'Missing WS method');
});

// 3. 技术指标库检查
test('技术指标库完整性', () => {
  const file = path.join(ROOT, 'products/contract-trading-system/strategies/technical-indicators.js');
  const content = fs.readFileSync(file, 'utf8');
  const indicators = [
    'sma', 'ema', 'macd', 'rsi', 'kdj',
    'bollingerBands', 'atr', 'vwap', 'movingAverages',
    'cross', 'overboughtOversold', 'breakout'
  ];
  indicators.forEach(ind => {
    assert(content.includes(`static ${ind}`), `Missing indicator: ${ind}`);
  });
});

// 4. 信号融合引擎检查
test('信号融合引擎功能', () => {
  const file = path.join(ROOT, 'products/contract-trading-system/strategies/signal-fusion-engine.js');
  const content = fs.readFileSync(file, 'utf8');
  assert(content.includes('class SignalFusionEngine'), 'Missing class');
  assert(content.includes('registerStrategy'), 'Missing registerStrategy');
  assert(content.includes('receiveSignal'), 'Missing receiveSignal');
  assert(content.includes('fuseSignals'), 'Missing fuseSignals');
  assert(content.includes('adjustWeights'), 'Missing adjustWeights');
});

// 5. 高胜率策略检查
test('高胜率策略实现', () => {
  const file = path.join(ROOT, 'products/contract-trading-system/strategies/high-winrate-strategy.js');
  const content = fs.readFileSync(file, 'utf8');
  assert(content.includes('class HighWinrateStrategy'), 'Missing class');
  assert(content.includes('generateSignal'), 'Missing generateSignal');
  assert(content.includes('analyzeSignals'), 'Missing analyzeSignals');
  assert(content.includes('fuseSignals'), 'Missing fuseSignals');
  assert(content.includes('TechnicalIndicators'), 'Missing TI usage');
});

// 6. 回测引擎检查
test('回测引擎功能', () => {
  const file = path.join(ROOT, 'products/contract-trading-system/backtest/backtest-engine.js');
  const content = fs.readFileSync(file, 'utf8');
  assert(content.includes('class BacktestEngine'), 'Missing class');
  assert(content.includes('async run'), 'Missing run method');
  assert(content.includes('executeTrade'), 'Missing executeTrade');
  assert(content.includes('closePosition'), 'Missing closePosition');
  assert(content.includes('generateReport'), 'Missing generateReport');
  assert(content.includes('calculatePnL'), 'Missing calculatePnL');
});

// 7. 合约Agent检查
test('合约交易Agent实现', () => {
  const file = path.join(ROOT, 'products/contract-trading-system/contract-agent.js');
  const content = fs.readFileSync(file, 'utf8');
  assert(content.includes('class ContractTradingAgent'), 'Missing class');
  assert(content.includes('initialize'), 'Missing initialize');
  assert(content.includes('startTradingLoop'), 'Missing trading loop');
  assert(content.includes('executeTrade'), 'Missing executeTrade');
  assert(content.includes('OKXContractClient'), 'Missing OKX client');
  assert(content.includes('HighWinrateStrategy'), 'Missing strategy');
  assert(content.includes('SignalFusionEngine'), 'Missing fusion');
});

// 8. 配置文件检查
test('合约交易配置有效', () => {
  const file = path.join(ROOT, 'config/contract-trading.yaml');
  const content = fs.readFileSync(file, 'utf8');
  assert(content.includes('okx_contract'), 'Missing okx_contract section');
  assert(content.includes('strategy'), 'Missing strategy section');
  assert(content.includes('fusion'), 'Missing fusion section');
  assert(content.includes('risk_management'), 'Missing risk section');
  assert(content.includes('backtest'), 'Missing backtest section');
});

// 9. Node.js模块导出检查
test('合约模块可导出', () => {
  const okxClient = path.join(ROOT, 'products/exchange-adapters/okx-contract-client.js');
  const ti = path.join(ROOT, 'products/contract-trading-system/strategies/technical-indicators.js');
  const fusion = path.join(ROOT, 'products/contract-trading-system/strategies/signal-fusion-engine.js');
  const strategy = path.join(ROOT, 'products/contract-trading-system/strategies/high-winrate-strategy.js');
  const backtest = path.join(ROOT, 'products/contract-trading-system/backtest/backtest-engine.js');
  const agent = path.join(ROOT, 'products/contract-trading-system/contract-agent.js');

  [okxClient, ti, fusion, strategy, backtest, agent].forEach(file => {
    const content = fs.readFileSync(file, 'utf8');
    assert(content.includes('module.exports'), `Missing exports in ${path.basename(file)}`);
  });
});

// 10. 文档完整性
test('合约交易文档完整', () => {
  const readme = path.join(ROOT, 'products/contract-trading-system/README.md');
  assert(fs.existsSync(readme), 'Missing README.md');
  const content = fs.readFileSync(readme, 'utf8');
  assert(content.includes('高胜率'), 'Missing keyword');
  assert(content.includes('技术指标'), 'Missing indicators section');
  assert(content.includes('信号融合'), 'Missing fusion section');
  assert(content.includes('回测'), 'Missing backtest section');
});

console.log('='.repeat(50));
console.log(`\n📊 结果: ${passed} 通过, ${failed} 失败\n`);

if (failed > 0) {
  process.exit(1);
} else {
  console.log('🎉 所有合约交易系统测试通过!\n');
  process.exit(0);
}