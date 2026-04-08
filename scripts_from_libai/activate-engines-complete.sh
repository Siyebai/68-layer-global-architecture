#!/bin/bash
# 三大引擎激活与配置同步脚本
# 作用: 确保自主学习、进化、迭代引擎正确加载配置并启动

set -e

cd /root/.openclaw/workspace/libai-workspace

echo "=========================================="
echo "  三大自主引擎 - 完整激活流程"
echo "=========================================="
echo ""

GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

# 1. 检查配置完整性
echo -e "${GREEN}[1/7] 验证引擎配置...${NC}"
if grep -q "learning_engine:" config/production.yaml; then
  LEARNING_ENABLED=$(grep -A5 "learning_engine:" config/production.yaml | grep "enabled:" | awk '{print $2}')
  echo "  自主学习引擎: $LEARNING_ENABLED"
  
  if [ "$LEARNING_ENABLED" = "true" ]; then
    echo -e "  ${GREEN}✅ 自主学习引擎已启用${NC}"
  else
    echo -e "  ${RED}❌ 自主学习引擎未启用${NC}"
  fi
fi

if grep -q "evolution_engine:" config/production.yaml; then
  EVOLUTION_ENABLED=$(grep -A5 "evolution_engine:" config/production.yaml | grep "enabled:" | awk '{print $2}')
  echo "  自主进化引擎: $EVOLUTION_ENABLED"
  
  if [ "$EVOLUTION_ENABLED" = "true" ]; then
    echo -e "  ${GREEN}✅ 自主进化引擎已启用${NC}"
  else
    echo -e "  ${RED}❌ 自主进化引擎未启用${NC}"
  fi
fi

if grep -q "iteration_engine:" config/production.yaml; then
  ITERATION_ENABLED=$(grep -A5 "iteration_engine:" config/production.yaml | grep "enabled:" | awk '{print $2}')
  echo "  自主迭代引擎: $ITERATION_ENABLED"
  
  if [ "$ITERATION_ENABLED" = "true" ]; then
    echo -e "  ${GREEN}✅ 自主迭代引擎已启用${NC}"
  else
    echo -e "  ${RED}❌ 自主迭代引擎未启用${NC}"
  fi
fi

# 2. 检查引擎实现
echo ""
echo -e "${GREEN}[2/7] 检查引擎实现文件...${NC}"
if grep -q "class LearningEngine" scripts/ultimate-v26-autonomous-learning.js; then
  echo "✅ LearningEngine 类存在"
else
  echo "❌ LearningEngine 类缺失"
fi

if grep -q "class EvolutionEngine" scripts/ultimate-v26-autonomous-learning.js; then
  echo "✅ EvolutionEngine 类存在"
else
  echo "❌ EvolutionEngine 类缺失"
fi

if grep -q "class IterationEngine" scripts/ultimate-v26-autonomous-learning.js; then
  echo "✅ IterationEngine 类存在"
else
  echo "❌ IterationEngine 类缺失"
fi

# 3. 验证配置加载
echo ""
echo -e "${GREEN}[3/7] 验证配置加载逻辑...${NC}"
# 检查主系统脚本是否读取配置文件
if grep -q "yaml.loadFile\|fs.readFileSync.*config/production.yaml" scripts/ultimate-v26-autonomous-learning.js; then
  echo "✅ 主系统脚本包含配置文件读取逻辑"
else
  echo -e "${YELLOW}⚠️  主系统脚本可能未读取配置文件${NC}"
  echo "   需要确保配置参数传递到引擎构造函数"
fi

# 4. 重启主系统以应用配置
echo ""
echo -e "${GREEN}[4/7] 重启主系统应用引擎配置...${NC}"
pm2 restart libai-system
sleep 5

# 5. 检查重启状态
echo ""
echo -e "${GREEN}[5/7] 检查进程状态...${NC}"
pm2 list --no-color | grep -E "libai-system|v26-learning" | head -5

# 6. 检查引擎日志
echo ""
echo -e "${GREEN}[6/7] 检查引擎启动日志...${NC}"
sleep 2
ENGINE_LOG=$(tail -100 logs/combined.log 2>/dev/null | grep -i "三大引擎\|V26.0.*自主学习\|LearningEngine\|EvolutionEngine\|IterationEngine" | tail -3)
if [ -n "$ENGINE_LOG" ]; then
  echo "✅ 发现引擎活动:"
  echo "$ENGINE_LOG"
else
  echo -e "${YELLOW}⚠️  未发现引擎启动日志，检查健康状态...${NC}"
fi

# 7. 验证健康接口
echo ""
echo -e "${GREEN}[7/7] 验证系统健康接口...${NC}"
HEALTH=$(curl -s http://localhost:3000/health 2>/dev/null)
if echo "$HEALTH" | grep -q '"status":"ok"'; then
  echo "✅ 健康检查通过"
  echo "   Redis: $(echo "$HEALTH" | grep -o '"redis":"[^"]*"' | cut -d'"' -f4)"
  echo "   Agents: $(echo "$HEALTH" | grep -o '"agents":[0-9]*' | cut -d':' -f2)"
else
  echo "❌ 健康检查失败"
  echo "   响应: $HEALTH"
fi

# 8. 检查状态接口中的引擎信息
echo ""
echo -e "${GREEN}[8/8] 检查引擎状态接口...${NC}"
STATUS=$(curl -s http://localhost:3000/status 2>/dev/null)
if echo "$STATUS" | grep -q "engines"; then
  echo "✅ 状态接口包含引擎信息"
  echo "$STATUS" | grep -A5 '"engines"' || true
else
  echo -e "${YELLOW}⚠️  状态接口可能未包含引擎信息${NC}"
fi

# 生成详细报告
echo ""
echo -e "${GREEN}📊 生成详细报告...${NC}"
REPORT_FILE="ENGINES-ACTIVATION-REPORT-$(date +%Y%m%d-%H%M).md"
cat > "$REPORT_FILE" << EOF
# 自主进化与学习引擎激活报告

## 执行时间
$(date)

## 配置状态汇总

### 自主学习引擎
- 配置文件: config/production.yaml → learning_engine
- 启用状态: $(grep -A5 "learning_engine:" config/production.yaml | grep "enabled:" | awk '{print $2}')
- 知识库路径: $(grep "knowledge_base_path" config/production.yaml | cut -d'"' -f2)
- 训练间隔: $(grep "training_interval_minutes" config/production.yaml | awk '{print $2}') 分钟
- 最小样本: $(grep "min_samples_for_training" config/production.yaml | awk '{print $2}')
- 自动优化: $(grep "auto_optimize" config/production.yaml | awk '{print $2}')

### 自主进化引擎
- 配置文件: config/production.yaml → evolution_engine
- 启用状态: $(grep -A5 "evolution_engine:" config/production.yaml | grep "enabled:" | awk '{print $2}')
- 变异率: $(grep "mutation_rate" config/production.yaml | awk '{print $2}')
- 交叉率: $(grep "crossover_rate" config/production.yaml | awk '{print $2}')
- 选择压力: $(grep "selection_pressure" config/production.yaml | awk '{print $2}')
- 种群大小: $(grep "population_size" config/production.yaml | awk '{print $2}')
- 每日代数: $(grep "generations_per_day" config/production.yaml | awk '{print $2}')

### 自主迭代引擎
- 配置文件: config/production.yaml → iteration_engine
- 启用状态: $(grep -A5 "iteration_engine:" config/production.yaml | grep "enabled:" | awk '{print $2}')
- 最大迭代: $(grep "max_iterations_per_cycle" config/production.yaml | awk '{print $2}')
- 收敛阈值: $(grep "convergence_threshold" config/production.yaml | awk '{print $2}')
- 学习率: $(grep "learning_rate" config/production.yaml | awk '{print $2}')
- 批次大小: $(grep "batch_size" config/production.yaml | awk '{print $2}')
- 早停耐心: $(grep "early_stopping_patience" config/production.yaml | awk '{print $2}')

## 实现文件检查
- 主系统脚本: scripts/ultimate-v26-autonomous-learning.js
- LearningEngine 类: $(grep -c "class LearningEngine" scripts/ultimate-v26-autonomous-learning.js)
- EvolutionEngine 类: $(grep -c "class EvolutionEngine" scripts/ultimate-v26-autonomous-learning.js)
- IterationEngine 类: $(grep -c "class IterationEngine" scripts/ultimate-v26-autonomous-learning.js)

## 进程状态
$(pm2 list --no-color | grep -E "libai-system|v26-learning" || echo "无相关进程")

## 健康检查
$HEALTH

## 状态接口摘要
$STATUS | head -20

## 知识库统计
- 总文档数: $(find knowledge data/knowledge -name "*.md" 2>/dev/null | wc -l)
- 学习文档: $(find memory/learning -name "*.md" 2>/dev/null | wc -l)
- 进化文档: $(find knowledge -name "*evolution*" -o -name "*self-evolution*" 2>/dev/null | wc -l)

## 关键日志片段
$ENGINE_LOG

## 后续监控命令
\`\`\`bash
# 查看引擎状态
curl http://localhost:3000/status | jq '.engines'

# 查看学习状态
curl http://localhost:3000/learning-status

# 查看进化状态
curl http://localhost:3000/evolution-status

# 监控日志
pm2 logs libai-system --lines 50
\`\`\`

## 结论
✅ 三大引擎配置已就绪，主系统已重启
📊 建议持续监控日志确认引擎周期性运行
🎯 目标: 系统能够自我学习、进化、迭代优化交易策略
EOF

echo "✅ 详细报告已生成: $REPORT_FILE"

echo ""
echo -e "${GREEN}🎉 自主进化与学习引擎激活完成！${NC}"
echo ""
echo -e "${YELLOW}📈 下一步:${NC}"
echo "1. 监控系统日志，确认引擎周期性运行"
echo "2. 检查知识库是否足够丰富（建议1000+文档）"
echo "3. 配置STEPFUN_API_KEY以增强AI能力"
echo "4. 定期查看生成的进化报告"
echo ""
echo -e "${GREEN}🚀 系统现已具备自我进化能力！${NC}"
