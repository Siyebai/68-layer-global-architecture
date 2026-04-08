#!/usr/bin/env node

/**
 * 测试运行器 - 执行所有单元测试
 */

const { spawn } = require('child_process');
const path = require('path');

const tests = [
  'tests/unit/position-manager.test.js',
  'tests/unit/base-agent.test.js',
];

console.log('🧪 开始运行单元测试...\n');

let passed = 0;
let failed = 0;

async function runTest(testFile) {
  return new Promise((resolve) => {
    console.log(`▶️  运行: ${testFile}`);
    const proc = spawn('node', [testFile], {
      stdio: 'inherit',
      cwd: path.resolve(__dirname, '..'),
    });

    proc.on('close', (code) => {
      if (code === 0) {
        console.log(`✅ 通过: ${testFile}\n`);
        passed++;
      } else {
        console.log(`❌ 失败: ${testFile} (exit code: ${code})\n`);
        failed++;
      }
      resolve();
    });
  });
}

async function main() {
  for (const test of tests) {
    await runTest(test);
  }

  console.log('═══════════════════════════');
  console.log(`📊 测试结果: ${passed} 通过, ${failed} 失败`);
  console.log('═══════════════════════════');

  process.exit(failed > 0 ? 1 : 0);
}

main().catch(console.error);