#!/usr/bin/env node

/**
 * 李白AI交易系统 - 通用备份助手
 * 使用GitHub HTTP API直接上传文件，无需Git环境
 * 支持创建和更新文件，自动处理SHA
 *
 * 用法:
 *   GITHUB_TOKEN=ghp_xxx node backup-helper.js
 *   或配置 .env 文件中的 GITHUB_TOKEN
 *   或指定文件/目录: node backup-helper.js file1 file2 dir1
 */

require('dotenv').config();
const fs = require('fs');
const path = require('path');

const GITHUB_TOKEN = process.env.GITHUB_TOKEN || process.argv[2];
const REPO = 'Siyebai/libai-workspace';
const API_BASE = 'https://api.github.com';

if (!GITHUB_TOKEN) {
  console.error('❌ 错误: 需要 GITHUB_TOKEN');
  console.error('用法: GITHUB_TOKEN=ghp_xxx node backup-helper.js');
  console.error('或: 将 GITHUB_TOKEN 写入 .env 文件');
  process.exit(1);
}

/**
 * Base64编码文件内容
 */
function encodeFile(filePath) {
  const content = fs.readFileSync(filePath);
  return Buffer.from(content).toString('base64');
}

/**
 * 获取文件的Git SHA（用于更新）
 */
async function getFileSha(filePath) {
  const url = `${API_BASE}/repos/${REPO}/contents/${filePath}`;
  const res = await fetch(url, {
    headers: {
      'Authorization': `token ${GITHUB_TOKEN}`,
      'User-Agent': 'Libai-Backup-Helper'
    }
  });

  if (res.ok) {
    const data = await res.json();
    return data.sha;
  }
  return null;
}

/**
 * 上传文件到GitHub
 */
async function uploadFile(localPath, repoPath, message = null) {
  if (!fs.existsSync(localPath)) {
    console.log(`⚠️  文件不存在，跳过: ${localPath}`);
    return { success: false, reason: 'not_found' };
  }

  try {
    const content = encodeFile(localPath);
    const sha = await getFileSha(repoPath);

    const url = `${API_BASE}/repos/${REPO}/contents/${repoPath}`;
    const data = {
      message: message || `backup: ${repoPath}`,
      content: content
    };

    if (sha) {
      data.sha = sha;
    }

    const res = await fetch(url, {
      method: 'PUT',
      headers: {
        'Authorization': `token ${GITHUB_TOKEN}`,
        'User-Agent': 'Libai-Backup-Helper'
      },
      body: JSON.stringify(data)
    });

    const result = await res.json();

    if (res.ok) {
      console.log(`✅ ${repoPath} (${(fs.statSync(localPath).size / 1024).toFixed(1)} KB)`);
      return { success: true, result };
    } else {
      console.log(`❌ ${repoPath}: ${result.message}`);
      return { success: false, error: result.message };
    }
  } catch (err) {
    console.log(`❌ ${repoPath}: ${err.message}`);
    return { success: false, error: err.message };
  }
}

/**
 * 递归上传目录
 */
async function uploadDirectory(localDir, repoDir = '', options = {}) {
  const {
    skipDirs = ['node_modules', '.git', 'logs', 'tmp', 'dist', 'build', '.next', '.nuxt', '.cache'],
    skipFiles = ['.DS_Store', 'Thumbs.db', 'package-lock.json', 'yarn.lock', 'pnpm-lock.yaml']
  } = options;

  const files = fs.readdirSync(localDir);
  let uploaded = 0;
  let failed = 0;

  for (const file of files) {
    const localPath = path.join(localDir, file);
    const stat = fs.statSync(localPath);

    if (stat.isDirectory()) {
      if (skipDirs.includes(file)) {
        continue;
      }
      const subDir = path.join(repoDir, file);
      const result = await uploadDirectory(localPath, subDir, options);
      uploaded += result.uploaded;
      failed += result.failed;
    } else {
      if (skipFiles.includes(file)) {
        continue;
      }
      const repoPath = path.join(repoDir, file).replace(/\\/g, '/');
      const result = await uploadFile(localPath, repoPath, `backup: ${repoPath} - ${new Date().toISOString()}`);
      if (result.success) uploaded++;
      else failed++;
    }
  }

  return { uploaded, failed };
}

/**
 * 主函数
 */
async function main() {
  console.log('🚀 李白AI交易系统 - 备份助手');
  console.log(`📦 目标仓库: ${REPO}`);
  console.log(`🔑 Token: ${GITHUB_TOKEN.slice(0, 10)}...`);

  // 1. 测试API连接
  console.log('\n🔍 测试GitHub API连接...');
  const testRes = await fetch(`${API_BASE}/repos/${REPO}`, {
    headers: {
      'Authorization': `token ${GITHUB_TOKEN}`,
      'User-Agent': 'Libai-Backup-Helper'
    }
  });

  if (!testRes.ok) {
    const err = await testRes.json();
    console.log(`❌ 连接失败: ${err.message}`);
    process.exit(1);
  }

  const repoInfo = await testRes.json();
  console.log(`✅ 仓库可访问: ${repoInfo.full_name}`);
  console.log(`   描述: ${repoInfo.description || '无'}`);
  console.log(`   默认分支: ${repoInfo.default_branch}`);

  // 2. 处理命令行参数 - 如果指定了文件则只上传指定文件
  const args = process.argv.slice(2);
  let successCount = 0;
  let failCount = 0;

  if (args.length > 0) {
    // 上传指定文件/目录
    console.log('\n📤 上传指定文件/目录...');
    for (const arg of args) {
      const localPath = path.resolve(process.cwd(), arg);
      if (!fs.existsSync(localPath)) {
        console.log(`⚠️  文件不存在: ${arg}`);
        continue;
      }

      const stat = fs.statSync(localPath);
      if (stat.isDirectory()) {
        const result = await uploadDirectory(localPath, arg);
        successCount += result.uploaded;
        failCount += result.failed;
        console.log(`   ${arg}/: ${result.uploaded} 个文件, ${result.failed} 个失败`);
      } else {
        const result = await uploadFile(localPath, arg, `backup: ${arg} - ${new Date().toISOString()}`);
        if (result.success) successCount++;
        else failCount++;
      }
    }
  } else {
    // 上传核心文件（优先）
    console.log('\n📤 开始上传核心文件...');

    const coreFiles = [
      'MEMORY.md',
      'SOUL.md',
      'USER.md',
      'IDENTITY.md',
      'AGENTS.md',
      'TOOLS.md',
      'HEARTBEAT.md',
      'BACKUP-GUIDE.md',
      'BACKUP-OPERATION-REPORT.md',
      'COMPLETE-BACKUP-DELIVERY.md',
      'RESPONSE_OPTIMIZATION_RULES.md',
      'RESPONSE_OPTIMIZATION_COMPLETE.md',
      'COMPLETE-BACKUP-DELIVERY.md'
    ];

    for (const file of coreFiles) {
      const localPath = path.join(process.cwd(), file);
      if (fs.existsSync(localPath)) {
        const result = await uploadFile(localPath, file, `backup: ${file} - ${new Date().toISOString()}`);
        if (result.success) successCount++;
        else failCount++;
      } else {
        console.log(`⚠️  文件不存在: ${file}`);
      }
    }

    // 3. 上传memory目录
    console.log('\n📁 上传 memory 目录...');
    const memoryDir = path.join(process.cwd(), 'memory');
    if (fs.existsSync(memoryDir)) {
      const result = await uploadDirectory(memoryDir, 'memory');
      successCount += result.uploaded;
      failCount += result.failed;
      console.log(`   memory/: ${result.uploaded} 个文件, ${result.failed} 个失败`);
    }

    // 4. 上传libai-workspace项目目录（排除大目录）
    console.log('\n📦 上传 libai-workspace 项目文件...');
    const libaiDir = path.join(process.cwd(), 'libai-workspace');
    if (fs.existsSync(libaiDir)) {
      const result = await uploadDirectory(libaiDir, 'libai-workspace', {
        skipDirs: ['node_modules', '.git', 'logs', 'tmp', 'dist', 'build', '.next', '.nuxt', '.cache'],
        skipFiles: ['.DS_Store', 'Thumbs.db', 'package-lock.json', 'yarn.lock', 'pnpm-lock.yaml', '.env', '.env.local']
      });
      successCount += result.uploaded;
      failCount += result.failed;
      console.log(`   libai-workspace/: ${result.uploaded} 个文件, ${result.failed} 个失败`);
    } else {
      console.log('   ⚠️  libai-workspace 目录不存在，跳过');
    }
  }

  // 5. 输出总结
  console.log('\n' + '='.repeat(50));
  console.log('📊 上传完成统计');
  console.log('='.repeat(50));
  console.log(`✅ 成功: ${successCount} 个文件`);
  console.log(`❌ 失败: ${failCount} 个文件`);
  console.log('\n💡 下一步:');
  console.log('1. 访问 https://github.com/Siyebai/libai-workspace');
  console.log('2. 验证文件是否已更新');
  console.log('3. 如需完整项目，请手动上传压缩包或使用Git clone');
  console.log('='.repeat(50));
}

main().catch(console.error);