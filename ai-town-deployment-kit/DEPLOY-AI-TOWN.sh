#!/bin/bash
# AI Town一键部署脚本 - 为客户快速部署
set -e
echo "🚀 AI Town Deployment"
if ! command -v docker &> /dev/null; then
  echo "❌ 需要Docker: https://docs.docker.com/get-docker/"
  exit 1
fi
echo "✅ Docker OK"
if [ ! -d "ai-town" ]; then
  git clone https://github.com/a16z-infra/ai-town.git
fi
cd ai-town
echo "⚙️  启动..."
docker-compose up -d
sleep 30
echo "✅ 部署完成！访问: http://localhost:3000"
echo "📝 配置Ollama: ollama pull llama3 && ollama serve"
