#!/usr/bin/env node

/**
 * 李白AI交易系统 - 核心测试
 * 验证系统各组件的完整性和配置正确性
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const ROOT = path.join(__dirname, '..');
const tests = [];
let passed = 0;
let failed = 0;

function test(name, fn) {
  tests.push({ name, fn });
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message || 'Assertion failed');
  }
}

// 1. 文件完整性检查
test('配置文件存在', () => {
  const files = [
    '.env',
    '.env.example',
    'ecosystem.config.js',
    'package.json',
    'config/production.yaml',
    'config/development.yaml',
    'config/testing.yaml',
    'config/monitoring-config.json',
    'config/security-config.json',
    'config/backup-config.json',
  ];
  files.forEach(file => {
    const fullPath = path.join(ROOT, file);
    assert(fs.existsSync(fullPath), `Missing file: ${file}`);
  });
});

// 2. 核心脚本存在 (V26优先，回退到V24)
test('核心系统脚本存在', () => {
  const v26Script = path.join(ROOT, 'scripts/ultimate-v26-autonomous-learning.js');
  const v24Script = path.join(ROOT, 'scripts/ultimate-v24-autonomous.js');
  let scriptPath = v26Script;

  if (!fs.existsSync(v26Script)) {
    scriptPath = v24Script;
  }

  assert(fs.existsSync(scriptPath), `Missing core system script (checked V26 and V24)`);
  const content = fs.readFileSync(scriptPath, 'utf8');
  assert(content.includes('class TradingSystem'), 'Invalid script format');
  assert(content.includes('Agent'), 'Missing Agent definition');
});

// 3. 环境配置检查
test('.env 配置正确', () => {
  const envPath = path.join(ROOT, '.env');
  const content = fs.readFileSync(envPath, 'utf8');

  // 检查必需变量是否存在
  assert(content.includes('STEPFUN_API_KEY'), 'Missing STEPFUN_API_KEY');
  assert(content.includes('TELEGRAM_BOT_TOKEN'), 'Missing TELEGRAM_BOT_TOKEN');
  assert(content.includes('DATABASE_URL'), 'Missing DATABASE_URL');
  assert(content.includes('REDIS_URL'), 'Missing REDIS_URL');
});

// 4. 依赖检查
test('Node.js 依赖已安装', () => {
  const nodeModules = path.join(ROOT, 'node_modules');
  assert(fs.existsSync(nodeModules), 'node_modules not found, run npm ci');
  const pkg = require(path.join(ROOT, 'package.json'));
  const deps = pkg.dependencies;
  Object.keys(deps).forEach(dep => {
    const depPath = path.join(ROOT, 'node_modules', dep);
    assert(fs.existsSync(depPath), `Missing dependency: ${dep}`);
  });
});

// 5. 数据库连接检查
test('PostgreSQL 连接', () => {
  try {
    const result = execSync('pg_isready -d libai_trading', { encoding: 'utf8' });
    assert(result.includes('accepting'), 'PostgreSQL not ready');
  } catch (err) {
    throw new Error('PostgreSQL not running or database libai_trading does not exist');
  }
});

// 6. Redis 连接检查
test('Redis 连接', () => {
  try {
    const result = execSync('redis-cli ping', { encoding: 'utf8' });
    assert(result.trim() === 'PONG', 'Redis not responding');
  } catch (err) {
    throw new Error('Redis not running');
  }
});

// 7. 知识库完整性
test('知识库文档完整', () => {
  const knowledgeDir = path.join(ROOT, 'knowledge');
  assert(fs.existsSync(knowledgeDir), 'knowledge directory missing');

  const requiredDocs = [
    'final-summary-v8.md',
    'multi-agent-complete-v3.md',
    'system-construction-v6.md',
    'ai-agent-self-evolution-v1.md',
  ];
  requiredDocs.forEach(doc => {
    const docPath = path.join(knowledgeDir, doc);
    assert(fs.existsSync(docPath), `Missing knowledge doc: ${doc}`);
  });
});

// 8. 业务模块检查
test('业务模块存在', () => {
  const productsDir = path.join(ROOT, 'products');
  assert(fs.existsSync(productsDir), 'products directory missing');

  const modules = [
    'telegram-bot-system',
    'user-management',
    'payment-integration',
    'libai-arbitrage-starter',
  ];
  modules.forEach(mod => {
    const modPath = path.join(productsDir, mod);
    assert(fs.existsSync(modPath), `Missing module: ${mod}`);
  });
});

// 9. 文档检查
test('文档完整', () => {
  const docsDir = path.join(ROOT, 'docs');
  assert(fs.existsSync(docsDir), 'docs directory missing');

  const requiredDocs = [
    'deployment-guide.md',
    'v24-api-documentation.md',
    'troubleshooting.md',
  ];
  requiredDocs.forEach(doc => {
    const docPath = path.join(docsDir, doc);
    assert(fs.existsSync(docPath), `Missing doc: ${doc}`);
  });
});

// 10. 核心类导出检查
test('核心类可导出', () => {
  // 这里可以更深入的测试，暂时简化
  const scriptPath = path.join(ROOT, 'scripts/ultimate-v24-autonomous.js');
  const content = fs.readFileSync(scriptPath, 'utf8');
  assert(content.includes('class'), 'No classes defined');
  assert(content.includes('module.exports'), 'No exports found');
});

// 运行测试
console.log('\n🧪 李白AI交易系统 - 核心测试\n');
console.log('=' .repeat(50));

for (const { name, fn } of tests) {
  try {
    fn();
    console.log(`✅ ${name}`);
    passed++;
  } catch (err) {
    console.log(`❌ ${name}: ${err.message}`);
    failed++;
  }
}

console.log('=' .repeat(50));
console.log(`\n📊 结果: ${passed} 通过, ${failed} 失败\n`);

if (failed > 0) {
  process.exit(1);
} else {
  console.log('🎉 所有测试通过! 系统已就绪。\n');
  process.exit(0);
}
