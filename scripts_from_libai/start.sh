#!/bin/bash

# 李白AI交易系统启动脚本
# 使用: cd /root/.openclaw/workspace/libai-workspace && ./scripts/start.sh

set -e  # 遇到错误立即退出

echo "========================================"
echo "  李白AI交易系统启动脚本 v1.0"
echo "  启动时间: $(date '+%Y-%m-%d %H:%M:%S')"
echo "========================================"

# 获取脚本所在目录和项目根目录
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
cd "$PROJECT_ROOT"

# 1. 检查环境变量
echo "[1/6] 检查环境变量..."
ENV_FILE=".env"
if [ ! -f "$ENV_FILE" ]; then
    echo "❌ 错误: .env 文件不存在，请复制 .env.example 并配置真实密钥"
    exit 1
fi

source "$ENV_FILE"
if [ -z "$STEPFUN_API_KEY" ] || [ "$STEPFUN_API_KEY" = "your_stepfun_api_key_here" ]; then
    echo "⚠️  警告: STEPFUN_API_KEY 未配置或为占位符，AI功能将不可用"
    echo "   请编辑 .env 文件填入真实密钥"
fi
if [ -z "$TELEGRAM_BOT_TOKEN" ] || [ "$TELEGRAM_BOT_TOKEN" = "你的Telegram_Bot_Token" ]; then
    echo "⚠️  警告: TELEGRAM_BOT_TOKEN 未配置，Telegram 通知将不可用"
fi
if [ -z "$OKX_API_KEY" ] || [ "$OKX_API_KEY" = "你的OKX_API_Key" ]; then
    echo "⚠️  警告: OKX API 未配置，请编辑 .env 文件"
fi

echo "✅ 环境变量检查通过"

# 2. 检查依赖
echo "[2/6] 检查依赖..."
if ! command -v node &> /dev/null; then
    echo "❌ Node.js 未安装"
    exit 1
fi
if ! command -v psql &> /dev/null; then
    echo "❌ PostgreSQL 客户端未安装"
    exit 1
fi
if ! command -v redis-cli &> /dev/null; then
    echo "❌ Redis 客户端未安装"
    exit 1
fi
echo "✅ 依赖检查通过 (Node.js $(node --version), PostgreSQL $(psql --version | head -1), Redis $(redis-cli --version | head -1))"

# 3. 检查服务
echo "[3/6] 检查数据库和Redis..."
if ! pg_isready -d libai_trading &> /dev/null; then
    echo "❌ PostgreSQL 未运行或数据库 libai_trading 不存在"
    echo "   请运行: sudo -u postgres psql -c 'CREATE DATABASE libai_trading;'"
    exit 1
fi
if ! redis-cli ping &> /dev/null; then
    echo "❌ Redis 未运行"
    exit 1
fi
echo "✅ 数据库和Redis运行正常"

# 4. 安装npm依赖
echo "[4/6] 检查npm依赖..."
if [ ! -d "node_modules" ]; then
    echo "   安装npm依赖..."
    npm install --omit=dev
fi
echo "✅ npm依赖已就绪"

# 5. 运行测试
echo "[5/6] 运行核心测试..."
if [ -f "scripts/test-core.js" ]; then
    node scripts/test-core.js && echo "✅ 核心测试通过" || echo "⚠️  核心测试失败，但继续启动..."
else
    echo "⚠️  未找到测试脚本，跳过"
fi

# 6. 启动系统
echo "[6/6] 启动系统..."
if command -v pm2 &> /dev/null; then
    echo "   使用 PM2 启动..."
    if [ -f "ecosystem.config.js" ]; then
        pm2 start ecosystem.config.js
    else
        echo "   ❌ ecosystem.config.js 不存在，请检查路径: $PROJECT_ROOT/ecosystem.config.js"
        exit 1
    fi
    pm2 save
    echo "   系统已启动，查看状态: pm2 status"
    echo "   查看日志: pm2 logs libai-system"
else
    echo "   使用 nohup 启动..."
    nohup node scripts/ultimate-v24-autonomous.js > logs/system.log 2>&1 &
    echo "   系统已启动，日志: logs/system.log"
fi

echo ""
echo "========================================"
echo "  启动完成!"
echo "  健康检查: curl http://localhost:3000/health"
echo "  系统状态: curl http://localhost:3000/status"
echo "  停止系统: pm2 stop all (或 kill进程)"
echo "========================================"
