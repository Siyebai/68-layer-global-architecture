#!/bin/bash
# 完整自主系统启动脚本

cd /root/.openclaw/workspace/libai-workspace

echo "=========================================="
echo "  启动完全自主系统"
echo "=========================================="
echo ""

# 1. 检查环境
echo "[1/5] 检查环境..."
if [ ! -f ".env" ]; then
  echo "❌ .env文件不存在，请先配置环境变量"
  exit 1
fi

source .env 2>/dev/null || true
if [ -z "$STEPFUN_API_KEY" ] || [ "$STEPFUN_API_KEY" = "your_stepfun_api_key_here" ]; then
  echo "⚠️  STEPFUN_API_KEY未配置，AI功能将受限"
fi
echo "✅ 环境检查通过"
echo ""

# 2. 启动监控器 (后台)
echo "[2/5] 启动自主监控器..."
node scripts/autonomy-monitor.js > logs/autonomy-monitor.log 2>&1 &
echo "✅ 监控器已启动 (PID: $!)"
echo ""

# 3. 启动报告生成器 (后台)
echo "[3/5] 启动报告生成器..."
node scripts/autonomy-reporter.js > logs/autonomy-reporter.log 2>&1 &
echo "✅ 报告生成器已启动 (PID: $!)"
echo ""

# 4. 重启主系统
echo "[4/5] 重启主系统..."
pm2 restart libai-system
sleep 5
echo "✅ 主系统已重启"
echo ""

# 5. 显示状态
echo "[5/5] 检查系统状态..."
curl -s http://localhost:3000/health | jq . 2>/dev/null || echo "健康检查失败"
echo ""

echo "=========================================="
echo "  自主系统启动完成！"
echo "=========================================="
echo ""
echo "监控命令:"
echo "  查看主系统日志: pm2 logs libai-system"
echo "  查看监控器日志: tail -f logs/autonomy-monitor.log"
echo "  查看报告: ls -la reports/autonomy/"
echo "  查看状态: curl http://localhost:3000/status | jq"
echo ""
echo "🎯 系统现在完全自主运行！"
