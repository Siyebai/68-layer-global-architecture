#!/bin/bash
# 多智能体系统完整启动脚本
# 使用方法: bash scripts/start-all.sh

set -e

cd "$(dirname "$0")/.."

echo "🚀 启动多智能体通信系统..."
echo ""

# 1. 启动Event Bus
echo "📡 启动Event Bus..."
node communication/event-bus.js > /tmp/event-bus.log 2>&1 &
EVENT_BUS_PID=$!
echo "   Event Bus PID: $EVENT_BUS_PID"
sleep 2

# 检查Event Bus健康
if curl -s http://localhost:19958/health | grep -q "ok"; then
  echo "   ✅ Event Bus运行正常"
else
  echo "   ❌ Event Bus启动失败"
  exit 1
fi

# 2. 启动所有Agent
AGENTS=("c-libai" "q-libai" "cloud-libai" "bai-juyi" "du-fu")
PIDS=()

for agent in "${AGENTS[@]}"; do
  echo "🤖 启动Agent: $agent"
  AGENT_ID=$agent node scripts/agent-client.js > "/tmp/${agent}.log" 2>&1 &
  PID=$!
  PIDS+=($PID)
  echo "   PID: $PID"
done

echo ""
echo "⏳ 等待Agent连接..."
sleep 5

# 3. 检查连接状态
clients=$(curl -s http://localhost:19958/health | grep -o '"clients":[0-9]*' | cut -d: -f2)
echo ""
echo "📊 连接状态:"
echo "   Event Bus客户端数: ${clients:-0}/5"
echo "   Agent进程数: ${#PIDS[@]}"

if [ "${clients:-0}" -eq 5 ]; then
  echo "   ✅ 全部5个Agent已连接"
else
  echo "   ⚠️  只有${clients:-0}个Agent连接，查看日志:"
  for agent in "${AGENTS[@]}"; do
    echo "     tail -f /tmp/${agent}.log"
  done
fi

echo ""
echo "✅ 系统启动完成！"
echo ""
echo "📋 命令参考:"
echo "   查看状态: curl http://localhost:19958/health"
echo "   查看日志: tail -f /tmp/{agent}.log"
echo "   停止系统: kill ${EVENT_BUS_PID} ${PIDS[@]}"
echo ""
echo "🎯 测试通信: AGENT_ID=c-libai node -e \"...\""
