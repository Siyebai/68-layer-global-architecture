#!/bin/bash
# 启动自主进化与学习引擎
# 作用: 激活V26三大核心引擎，开启系统自我进化能力

set -e

echo "=========================================="
echo "  自主进化与学习引擎 - 启动脚本"
echo "=========================================="
echo ""

cd /root/.openclaw/workspace/libai-workspace

# 颜色
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

echo -e "${GREEN}[1] 检查引擎配置文件...${NC}"
if grep -q "learning_engine:" config/production.yaml; then
  echo "✅ 自主学习引擎配置存在"
else
  echo "❌ 自主学习引擎配置缺失"
  exit 1
fi

if grep -q "evolution_engine:" config/production.yaml; then
  echo "✅ 自主进化引擎配置存在"
else
  echo "❌ 自主进化引擎配置缺失"
  exit 1
fi

if grep -q "iteration_engine:" config/production.yaml; then
  echo "✅ 自主迭代引擎配置存在"
else
  echo "❌ 自主迭代引擎配置缺失"
  exit 1
fi

echo ""
echo -e "${GREEN}[2] 验证引擎依赖文件...${NC}"
# 检查必要的库文件
if [ -d "lib/autonomous-learning" ]; then
  echo "✅ 自主学习库存在"
  ls -1 lib/autonomous-learning/
else
  echo "❌ 自主学习库缺失"
fi

if [ -d "lib/agents" ]; then
  echo "✅ Agent系统库存在"
else
  echo "❌ Agent系统库缺失"
fi

echo ""
echo -e "${GREEN}[3] 检查知识库...${NC}"
if [ -d "knowledge" ]; then
  KNOWLEDGE_FILES=$(find knowledge -name "*.md" | wc -l)
  echo "✅ 知识库包含 ${KNOWLEDGE_FILES} 个文档"
else
  echo "⚠️ 知识库为空"
fi

if [ -d "data/knowledge" ]; then
  DATA_KNOWLEDGE=$(find data/knowledge -name "*.md" 2>/dev/null | wc -l)
  echo "✅ 数据知识库包含 ${DATA_KNOWLEDGE} 个文档"
fi

echo ""
echo -e "${GREEN}[4] 启动自主学习引擎...${NC}"
# 检查是否有独立的学习引擎脚本
if [ -f "scripts/ultimate-v26-autonomous-learning.js" ]; then
  echo "✅ 发现自主学习主脚本"
  
  # 检查是否已经在运行
  if pm2 list | grep -q "v26-learning"; then
    echo "⚠️ 学习引擎已经在运行，重启以应用新配置..."
    pm2 restart v26-learning || true
  else
    echo "🚀 启动学习引擎进程..."
    pm2 start scripts/ultimate-v26-autonomous-learning.js --name v26-learning --node-args="--max-old-space-size=1024"
  fi
else
  echo "⚠️ 未找到独立学习脚本，引擎内置于主系统"
fi

echo ""
echo -e "${GREEN}[5] 检查主系统引擎状态...${NC}"
# 等待一下让进程启动
sleep 3

# 检查进程
if pm2 list | grep -q "libai-system"; then
  echo "✅ 主系统运行中"
  
  # 检查日志中是否有引擎启动信息
  ENGINE_LOGS=$(grep -i "learning\|evolution\|iteration" logs/combined.log | tail -10)
  if [ -n "$ENGINE_LOGS" ]; then
    echo "✅ 发现引擎活动日志:"
    echo "$ENGINE_LOGS" | head -3
  else
    echo "⚠️ 未发现引擎活动日志，可能引擎尚未激活"
  fi
else
  echo "❌ 主系统未运行"
fi

echo ""
echo -e "${GREEN}[6] 验证配置加载...${NC}"
# 检查配置是否被正确读取
CONFIG_CHECK=$(grep -A20 "learning_engine:" config/production.yaml)
echo "学习引擎配置:"
echo "$CONFIG_CHECK" | head -7

echo ""
echo -e "${GREEN}[7] 生成引擎状态报告...${NC}"
REPORT_FILE="AUTONOMOUS-ENGINES-STATUS-$(date +%Y%m%d-%H%M).md"
cat > "$REPORT_FILE" << EOF
# 自主进化与学习引擎状态报告

## 生成时间
$(date)

## 引擎配置状态

### 自主学习引擎 (Learning Engine)
- 状态: $(grep -q "enabled: true" config/production.yaml && grep -A5 "learning_engine:" config/production.yaml | grep "enabled" && echo "✅ 已启用" || echo "❌ 未启用")
- 知识库路径: $(grep "knowledge_base_path" config/production.yaml | cut -d'"' -f2)
- 模型路径: $(grep "model_path" config/production.yaml | cut -d'"' -f2)
- 训练间隔: $(grep "training_interval_minutes" config/production.yaml | awk '{print $2}') 分钟
- 最小训练样本: $(grep "min_samples_for_training" config/production.yaml | awk '{print $2}')
- 自动优化: $(grep "auto_optimize" config/production.yaml | awk '{print $2}')

### 自主进化引擎 (Evolution Engine)
- 状态: $(grep -q "enabled: true" config/production.yaml && grep -A10 "evolution_engine:" config/production.yaml | grep "enabled" && echo "✅ 已启用" || echo "❌ 未启用")
- 变异率: $(grep "mutation_rate" config/production.yaml | awk '{print $2}')
- 交叉率: $(grep "crossover_rate" config/production.yaml | awk '{print $2}')
- 选择压力: $(grep "selection_pressure" config/production.yaml | awk '{print $2}')
- 种群大小: $(grep "population_size" config/production.yaml | awk '{print $2}')
- 每日代数: $(grep "generations_per_day" config/production.yaml | awk '{print $2}')

### 自主迭代引擎 (Iteration Engine)
- 状态: $(grep -q "enabled: true" config/production.yaml && grep -A10 "iteration_engine:" config/production.yaml | grep "enabled" && echo "✅ 已启用" || echo "❌ 未启用")
- 每周期最大迭代: $(grep "max_iterations_per_cycle" config/production.yaml | awk '{print $2}')
- 收敛阈值: $(grep "convergence_threshold" config/production.yaml | awk '{print $2}')
- 学习率: $(grep "learning_rate" config/production.yaml | awk '{print $2}')
- 批次大小: $(grep "batch_size" config/production.yaml | awk '{print $2}')
- 早停耐心: $(grep "early_stopping_patience" config/production.yaml | awk '{print $2}')

## 进程状态
$(pm2 list --no-color | grep -E "libai-system|v26-learning" || echo "无相关进程")

## 最新指标 (from logs)
$(tail -50 logs/combined.log 2>/dev/null | grep -E "learningCycles|evolutionGenerations|iterationsCompleted" | tail -1 || echo "暂无数据")

## 知识库统计
- 总文档数: $(find knowledge data/knowledge -name "*.md" 2>/dev/null | wc -l)
- 学习循环: $(grep -c "learning" memory/*.md 2>/dev/null || echo "0")
- 进化代数: $(grep -c "evolution" memory/*.md 2>/dev/null || echo "0")

## 建议后续操作
1. 确保 STEPFUN_API_KEY 已配置以启用AI功能
2. 监控引擎日志，确认它们正在周期性运行
3. 检查知识库是否足够丰富（建议1000+文档）
4. 定期查看生成的进化报告
EOF

echo "✅ 报告已生成: $REPORT_FILE"

echo ""
echo -e "${GREEN}[8] 优化建议${NC}"
echo -e "${YELLOW}📊 三大引擎已配置完成，但需要:${NC}"
echo "   1. 验证主系统是否正确加载引擎配置"
echo "   2. 可能需要重启主系统以应用引擎配置"
echo "   3. 确保有足够的数据供学习使用"
echo "   4. 监控日志确认引擎周期性运行"

echo ""
echo -e "${GREEN}✨ 自主进化与学习引擎检查完成！${NC}"
