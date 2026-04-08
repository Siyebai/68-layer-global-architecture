#!/usr/bin/env node
/**
 * 合约交易系统 V2.0 完整部署脚本
 * 包含: 环境检查、配置验证、服务启动、健康验证、监控配置
 */

const { exec } = require('child_process');
const fs = require('fs');
const path = require('path');
const http = require('http');

const ROOT = path.join(__dirname, '..');
const DOCKER_COMPOSE = 'docker-compose.yml';
const ENV_FILE = '.env';

// 彩色输出
const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  red: '\x1b[31m',
  cyan: '\x1b[36m',
};

function log(message, color = 'reset') {
  console.log(`${colors[color]}${message}${colors.reset}`);
}

function logStep(message) {
  console.log(`\n${colors.cyan}${'='.repeat(60)}${colors.reset}`);
  log(message, 'bright');
  console.log(`${colors.cyan}${'='.repeat(60)}${colors.reset}\n`);
}

function logSuccess(message) {
  log(`✅ ${message}`, 'green');
}

function logWarn(message) {
  log(`⚠️  ${message}`, 'yellow');
}

function logError(message) {
  log(`❌ ${message}`, 'red');
}

// 执行命令并等待完成
function execSync(command, cwd = ROOT) {
  return new Promise((resolve, reject) => {
    log(`执行: ${command}`, 'cyan');
    exec(command, { cwd, env: process.env }, (err, stdout, stderr) => {
      if (stdout) console.log(stdout);
      if (stderr) console.error(stderr);
      if (err) reject(err);
      else resolve();
    });
  });
}

// 检查文件存在
function checkFile(filepath, description) {
  const fullPath = path.join(ROOT, filepath);
  if (fs.existsSync(fullPath)) {
    logSuccess(`${description}: ${filepath}`);
    return true;
  } else {
    logError(`${description} 缺失: ${filepath}`);
    return false;
  }
}

// HTTP 健康检查
async function checkHTTP(url, timeout = 5000) {
  return new Promise((resolve) => {
    const start = Date.now();
    const req = http.get(url, { timeout }, (res) => {
      resolve({ status: res.statusCode, latency: Date.now() - start });
    });
    req.on('error', () => resolve(null));
    req.on('timeout', () => {
      req.destroy();
      resolve(null);
    });
  });
}

// 主流程
async function main() {
  logStep('📦 合约交易系统 V2.0 部署开始');

  try {
    // 1. 环境检查
    logStep('1️⃣ 环境检查');

    // 检查 Docker
    try {
      await execSync('docker --version');
      logSuccess('Docker 已安装');
    } catch (err) {
      logError('Docker 未安装，请先安装 Docker');
      process.exit(1);
    }

    // 检查 Docker Compose
    try {
      await execSync('docker compose version');
      logSuccess('Docker Compose 已安装');
    } catch (err) {
      logError('Docker Compose 未安装');
      process.exit(1);
    }

    // 检查 Node.js (本地)
    try {
      const nodeVersion = require('child_process').execSync('node --version').toString().trim();
      logSuccess(`Node.js 版本: ${nodeVersion}`);
    } catch (err) {
      logWarn('Node.js 未安装 (容器化部署可忽略)');
    }

    // 2. 配置文件检查
    logStep('2️⃣ 配置文件检查');

    const filesToCheck = [
      ['docker-compose.yml', 'Docker Compose 配置'],
      ['Dockerfile.contract', 'Dockerfile'],
      ['config/contract-trading.yaml', '合约交易配置'],
      ['.env', '环境变量文件'],
      ['nginx/nginx.conf', 'Nginx 配置'],
      ['prometheus/prometheus.yml', 'Prometheus 配置'],
      ['products/contract-trading-system/contract-trading-system-v2.js', '主程序'],
    ];

    let allFilesExist = true;
    for (const [file, desc] of filesToCheck) {
      if (!checkFile(file, desc)) {
        allFilesExist = false;
      }
    }

    if (!allFilesExist) {
      logError('部分配置文件缺失，请检查后重试');
      process.exit(1);
    }

    // 3. 环境变量配置
    logStep('3️⃣ 环境变量配置');

    if (!fs.existsSync(path.join(ROOT, ENV_FILE))) {
      logWarn('.env 文件不存在，从模板创建...');
      if (fs.existsSync(path.join(ROOT, '.env.example'))) {
        fs.copyFileSync(path.join(ROOT, '.env.example'), path.join(ROOT, ENV_FILE));
        logSuccess('.env 已从模板创建');
      } else {
        logError('.env.example 缺失，请手动创建 .env 文件');
        process.exit(1);
      }
    }

    // 读取 .env 检查关键变量
    const envContent = fs.readFileSync(path.join(ROOT, ENV_FILE), 'utf8');
    const requiredVars = ['OKX_API_KEY', 'OKX_SECRET_KEY', 'OKX_PASSPHRASE'];
    let envComplete = true;

    for (const varName of requiredVars) {
      if (!envContent.includes(varName) || envContent.includes(`${varName}=your_`)) {
        logWarn(`环境变量 ${varName} 未配置或为占位符`);
        envComplete = false;
      } else {
        logSuccess(`环境变量 ${varName} 已配置`);
      }
    }

    if (!envComplete) {
      logWarn('请编辑 .env 文件并填入真实的 API 密钥');
      log('是否继续? (y/N): ', 'yellow');
      // 这里可以添加交互确认，简化版直接继续
    }

    // 4. Docker 镜像构建
    logStep('4️⃣ 构建 Docker 镜像');

    try {
      await execSync('docker compose build', ROOT);
      logSuccess('Docker 镜像构建完成');
    } catch (err) {
      logError('Docker 镜像构建失败');
      process.exit(1);
    }

    // 5. 启动服务
    logStep('5️⃣ 启动服务 (Docker Compose)');

    try {
      await execSync('docker compose up -d', ROOT);
      logSuccess('所有服务已启动');
    } catch (err) {
      logError('服务启动失败');
      process.exit(1);
    }

    // 6. 等待服务就绪
    logStep('6️⃣ 等待服务就绪');

    const services = [
      { name: 'PostgreSQL', url: 'http://localhost:5432', check: 'tcp' },
      { name: 'Redis', url: 'http://localhost:6379', check: 'tcp' },
      { name: '合约交易系统', url: 'http://localhost:3000/health', check: 'http' },
      { name: 'Prometheus', url: 'http://localhost:9091', check: 'http' },
      { name: 'Grafana', url: 'http://localhost:3001', check: 'http' },
    ];

    log('等待服务启动 (最多 60 秒)...', 'cyan');

    for (const service of services) {
      let ready = false;
      for (let i = 0; i < 30; i++) {
        await new Promise(r => setTimeout(r, 2000));

        if (service.check === 'http') {
          const res = await checkHTTP(service.url, 2000);
          if (res && res.status === 200) {
            logSuccess(`${service.name} 已就绪 (延迟: ${res.latency}ms)`);
            ready = true;
            break;
          }
        } else {
          // TCP 检查简化版
          try {
            const socket = require('net').createConnection(service.url.replace('http://', '').split(':'));
            socket.once('connect', () => {
              socket.end();
              logSuccess(`${service.name} 已就绪`);
              ready = true;
            });
            socket.setTimeout(2000);
            socket.on('timeout', () => {});
          } catch (err) {}
        }
      }
      if (!ready) {
        logWarn(`${service.name} 未就绪，请检查日志`);
      }
    }

    // 7. 运行测试
    logStep('7️⃣ 运行系统测试');

    try {
      await execSync('node scripts/test-contract-v2.js', ROOT);
      logSuccess('所有测试通过');
    } catch (err) {
      logError('测试失败，请查看上述错误');
      process.exit(1);
    }

    // 8. 显示访问信息
    logStep('🎉 部署完成!');

    console.log(`
${colors.green}服务地址:${colors.reset}
  - API: http://localhost:3000
  - 健康检查: http://localhost:3000/health
  - 系统状态: http://localhost:3000/status
  - 合约状态: http://localhost:3000/contract-status
  - Prometheus 指标: http://localhost:9091
  - Grafana 仪表盘: http://localhost:3001 (admin/admin)
  - Jaeger 链路追踪: http://localhost:16686

${colors.yellow}查看日志:${colors.reset}
  - 合约交易系统: docker compose logs -f contract-trader
  - 所有服务: docker compose logs -f

${colors.cyan}管理命令:${colors.reset}
  - 重启所有服务: docker compose restart
  - 停止所有服务: docker compose down
  - 查看状态: docker compose ps
  - 进入容器: docker compose exec contract-trader sh

${colors.bright}下一步:${colors.reset}
  1. 配置真实 API 密钥 (.env 文件)
  2. 访问 http://localhost:3001 配置 Grafana (添加 Prometheus 数据源)
  3. 查看系统状态: curl http://localhost:3000/status
  4. 开始交易: 确保账户有足够余额，策略会自动运行
    `);

    logStep('📊 系统状态摘要');

    // 显示容器状态
    try {
      const ps = execSync('docker compose ps', { encoding: 'utf-8' });
      console.log(ps);
    } catch (err) {
      // 忽略
    }

  } catch (err) {
    logError(`部署失败: ${err.message}`);
    console.error(err);
    process.exit(1);
  }
}

// 运行
main();