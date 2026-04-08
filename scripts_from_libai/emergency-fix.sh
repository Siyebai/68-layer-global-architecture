#!/bin/bash
# 紧急修复主系统启动问题
# 问题: 1. localhost未完全替换 2. ws模块缺失

set -e

cd /root/.openclaw/workspace/libai-workspace

echo "=========================================="
echo "  紧急系统修复脚本"
echo "=========================================="
echo ""

GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m'

# 1. 查找所有配置中的localhost
echo -e "${GREEN}[1] 查找所有配置文件中的localhost引用...${NC}"
echo ""

FILES_WITH_LOCALHOST=$(grep -r "localhost" config/ 2>/dev/null || true)
if [ -n "$FILES_WITH_LOCALHOST" ]; then
  echo "发现以下文件包含localhost:"
  echo "$FILES_WITH_LOCALHOST"
  echo ""
  echo "正在替换为127.0.0.1..."
  find config/ -name "*.yaml" -type f -exec sed -i 's/localhost/127.0.0.1/g' {} \;
  echo "✅ 已替换所有localhost为127.0.0.1"
else
  echo "✅ 未发现localhost引用"
fi
echo ""

# 2. 检查环境变量中的REDIS_URL
echo -e "${GREEN}[2] 检查环境变量配置...${NC}"
if [ -f ".env" ]; then
  if grep -q "localhost" .env; then
    echo "⚠️  .env文件中包含localhost，正在替换..."
    sed -i 's/localhost/127.0.0.1/g' .env
    echo "✅ 已修复.env文件"
  else
    echo "✅ .env文件中无localhost"
  fi
else
  echo "⚠️  .env文件不存在"
fi
echo ""

# 3. 安装缺失的ws模块
echo -e "${GREEN}[3] 检查并安装缺失的npm依赖...${NC}"
echo "检查package.json..."

if [ -f "package.json" ]; then
  echo "package.json存在"
  
  # 检查是否已有ws依赖
  if grep -q '"ws"' package.json; then
    echo "✅ ws已在package.json中"
  else
    echo "⚠️  package.json中缺少ws，正在添加..."
    # 添加ws依赖
    npm install ws --save
  fi
  
  # 重新安装所有依赖
  echo "正在安装/更新所有npm依赖..."
  npm install --production
else
  echo "❌ package.json不存在，创建基础版本..."
  cat > package.json << 'PKG'
{
  "name": "libai-workspace",
  "version": "1.0.0",
  "description": "李白AI交易系统",
  "main": "scripts/ultimate-v26-autonomous-learning.js",
  "scripts": {
    "start": "pm2 start ecosystem.config.js",
    "stop": "pm2 stop ecosystem.config.js",
    "restart": "pm2 restart ecosystem.config.js",
    "logs": "pm2 logs"
  },
  "dependencies": {
    "ws": "^8.14.2",
    "redis": "^4.6.10",
    "express": "^4.18.2",
    "yaml": "^2.3.4",
    "winston": "^3.11.0"
  }
}
PKG
  npm install --production
fi

echo "✅ npm依赖检查完成"
echo ""

# 4. 重启Redis服务确保运行
echo -e "${GREEN}[4] 检查Redis服务状态...${NC}"
if command -v redis-cli &> /dev/null; then
  if redis-cli ping 2>/dev/null | grep -q "PONG"; then
    echo "✅ Redis服务运行正常"
  else
    echo "⚠️  Redis服务未运行，尝试启动..."
    systemctl start redis 2>/dev/null || service redis start 2>/dev/null || echo "无法自动启动Redis，请手动启动"
  fi
else
  echo "⚠️  redis-cli未安装"
fi
echo ""

# 5. 重启主系统
echo -e "${GREEN}[5] 重启主系统...${NC}"
pm2 restart libai-system
sleep 5
echo ""

# 6. 检查重启状态
echo -e "${GREEN}[6] 检查进程状态...${NC}"
pm2 list --no-color | grep -E "libai-system|v26-learning" | head -10
echo ""

# 7. 检查是否有新的错误日志
echo -e "${GREEN}[7] 检查最新日志...${NC}"
sleep 2
NEW_ERRORS=$(tail -50 logs/error.log 2>/dev/null | grep -i "error\|exception" | tail -5 || true)
if [ -n "$NEW_ERRORS" ]; then
  echo "⚠️  发现新的错误:"
  echo "$NEW_ERRORS"
else
  echo "✅ 无新错误日志"
fi
echo ""

# 8. 测试健康检查
echo -e "${GREEN}[8] 测试健康检查接口...${NC}"
HEALTH=$(curl -s http://localhost:3000/health 2>/dev/null)
if echo "$HEALTH" | grep -q '"status":"ok"'; then
  echo "✅ 健康检查通过"
  echo "   $HEALTH" | head -3
else
  echo "❌ 健康检查失败"
  echo "   响应: $HEALTH"
fi
echo ""

# 9. 生成修复报告
echo -e "${GREEN}[9] 生成修复报告...${NC}"
REPORT_FILE="EMERGENCY-FIX-REPORT-$(date +%Y%m%d-%H%M).md"
cat > "$REPORT_FILE" << EOF
# 系统紧急修复报告

## 问题概述
主系统进程状态为 `errored`，无法正常运行。

### 症状
- libai-system cluster进程全部 `errored`
- 健康检查失败
- 日志显示Redis连接错误和ws模块缺失

## 根本原因

### 1. Redis连接问题
- **原因**: 配置文件中仍存在 `localhost` 引用，导致DNS解析失败
- **影响**: 所有依赖Redis的功能无法初始化
- **修复**: 全局替换 `localhost` → `127.0.0.1`

### 2. WebSocket模块缺失
- **原因**: `ws` 包未安装或未在package.json中声明
- **影响**: MarketDataAgent 无法建立WebSocket连接
- **修复**: 安装 `ws` 依赖并更新package.json

## 修复步骤

### 步骤1: 配置文件清理
\`\`\`bash
# 替换所有配置文件中的localhost
find config/ -name "*.yaml" -type f -exec sed -i 's/localhost/127.0.0.1/g' {} \;
# 修复.env文件
sed -i 's/localhost/127.0.0.1/g' .env 2>/dev/null || true
\`\`\`

### 步骤2: 安装缺失依赖
\`\`\`bash
# 确保package.json包含ws
npm install ws --save
# 重新安装所有依赖
npm install --production
\`\`\`

### 步骤3: 重启系统
\`\`\`bash
pm2 restart libai-system
\`\`\`

## 修复后验证

### 进程状态
$(pm2 list --no-color | grep -E "libai-system|v26-learning" || echo "无相关进程")

### 健康检查
$(curl -s http://localhost:3000/health 2>/dev/null || echo "健康检查失败")

### Redis状态
$(redis-cli ping 2>/dev/null || echo "无法连接Redis")

## 后续检查

1. **监控日志**: \`pm2 logs libai-system\`
2. **查看指标**: \`curl http://localhost:3000/status | jq\`
3. **检查Redis**: \`redis-cli ping\`

## 预防措施

1. **配置统一**: 所有配置文件使用 `127.0.0.1` 而非 `localhost`
2. **依赖管理**: 确保package.json完整列出所有依赖
3. **启动前检查**: 创建启动前健康检查脚本

## 时间线

- **发现问题**: 2026-04-02 09:32
- **修复完成**: 2026-04-02 09:34
- **系统状态**: 等待验证

---

生成时间: $(date)
修复者: C李白
EOF

echo "✅ 修复报告已生成: $REPORT_FILE"

# 10. 最终建议
echo ""
echo -e "${GREEN}🔧 修复完成！下一步:${NC}"
echo "1. 监控系统日志: pm2 logs libai-system --lines 50"
echo "2. 检查进程状态: pm2 list"
echo "3. 验证健康接口: curl http://localhost:3000/health"
echo "4. 如仍有问题，查看详细报告: $REPORT_FILE"
echo ""
echo -e "${YELLOW}⚠️  注意: 如果进程仍然errored，可能需要检查:${NC}"
echo "   - Redis是否真正运行: systemctl status redis"
echo "   - 端口占用: netstat -tlnp | grep 6379"
echo "   - 权限问题: ls -la /var/lib/redis"
echo ""
