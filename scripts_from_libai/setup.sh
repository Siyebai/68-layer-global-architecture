#!/bin/bash

# 李白AI交易系统 - 环境setup脚本
# 用于首次部署和配置

set -e

echo "========================================"
echo "  李白AI交易系统 - 环境配置"
echo "  时间: $(date '+%Y-%m-%d %H:%M:%S')"
echo "========================================"

# 1. 检查权限
if [ "$(id -u)" != "0" ]; then
   echo "⚠️  建议使用root权限运行以确保安装顺利"
   SUDO="sudo"
else
   SUDO=""
fi

# 2. 创建必要目录
echo "[1/8] 创建目录结构..."
mkdir -p logs data/backups

# 3. 检查并安装Node.js
echo "[2/8] 检查Node.js..."
if ! command -v node &> /dev/null; then
    echo "   安装Node.js 22..."
    curl -fsSL https://deb.nodesource.com/setup_22.x | bash -
    $SUDO apt-get install -y nodejs
else
    echo "   Node.js已存在: $(node --version)"
fi

# 4. 检查并安装Python
echo "[3/8] 检查Python..."
if ! command -v python3 &> /dev/null; then
    echo "   安装Python 3.12..."
    $SUDO apt-get update
    $SUDO apt-get install -y python3.12 python3.12-venv python3-pip
else
    echo "   Python已存在: $(python3 --version)"
fi

# 5. 检查PostgreSQL
echo "[4/8] 检查PostgreSQL..."
if ! command -v psql &> /dev/null; then
    echo "   安装PostgreSQL 16..."
    $SUDO apt-get update
    $SUDO apt-get install -y postgresql-16 postgresql-client-16
    $SUDO systemctl start postgresql
    $SUDO systemctl enable postgresql
else
    echo "   PostgreSQL已安装"
fi

# 6. 检查Redis
echo "[5/8] 检查Redis..."
if ! command -v redis-cli &> /dev/null; then
    echo "   安装Redis..."
    $SUDO apt-get update
    $SUDO apt-get install -y redis-server
    $SUDO systemctl start redis
    $SUDO systemctl enable redis
else
    echo "   Redis已安装"
fi

# 7. 安装PM2
echo "[6/8] 安装PM2..."
if ! command -v pm2 &> /dev/null; then
    npm install -g pm2
    echo "   PM2已安装"
else
    echo "   PM2已存在: $(pm2 --version)"
fi

# 8. 安装系统依赖
echo "[7/8] 安装系统依赖..."
cd /root/.openclaw/workspace/libai-workspace
npm install --omit=dev

# 9. 配置数据库
echo "[8/8] 配置数据库..."
if $SUDO -u postgres psql -lqt | cut -d \| -f 1 | grep -qw libai_trading; then
    echo "   数据库 libai_trading 已存在"
else
    echo "   创建数据库和用户..."
    $SUDO -u postgres psql -c "CREATE USER libai WITH PASSWORD 'libai_password';"
    $SUDO -u postgres psql -c "CREATE DATABASE libai_trading OWNER libai;"
    $SUDO -u postgres psql -c "GRANT ALL PRIVILEGES ON DATABASE libai_trading TO libai;"
    echo "   数据库创建完成"
fi

# 10. 安装Python依赖
echo "[9/9] 安装Python依赖..."
cd products/telegram-bot-system
pip3 install --user -r requirements.txt
cd ../..

echo ""
echo "========================================"
echo "  环境配置完成!"
echo ""
echo "  接下来:"
echo "  1. 编辑 .env 文件，填入真实API密钥"
echo "  2. 运行: ./scripts/start.sh"
echo "========================================"
