#!/bin/bash
# 自主系统最终诊断与修复脚本

set -e

cd /root/.openclaw/workspace/libai-workspace

echo "=========================================="
echo "  自主系统最终诊断"
echo "=========================================="
echo ""

GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

# 1. 检查进程状态
echo -e "${GREEN}[1] 进程状态检查${NC}"
pm2 list --no-color | grep -E "libai-system|libai-bot|monitor|reporter" | head -10
echo ""

# 2. 检查Redis连接
echo -e "${GREEN}[2] Redis连接检查${NC}"
redis-cli ping 2>/dev/null || echo "Redis不可用"
echo ""

# 3. 检查环境变量
echo -e "${GREEN}[3] 环境变量检查${NC}"
source .env 2>/dev/null || true
echo "STEPFUN_API_KEY: ${STEPFUN_API_KEY:0:10}... (长度: ${#STEPFUN_API_KEY})"
echo "OKX_API_KEY: ${OKX_API_KEY:0:10}... (长度: ${#OKX_API_KEY})"
echo "REDIS_URL: ${REDIS_URL}"
echo ""

# 4. 检查MarketDataAgent错误
echo -e "${GREEN}[4] MarketDataAgent错误分析${NC}"
ERROR_COUNT=$(tail -100 logs/combined.log 2>/dev/null | grep -c "Polling error" || echo "0")
echo "最近100行日志中的Polling error数: $ERROR_COUNT"
if [ "$ERROR_COUNT" -gt 10 ]; then
  echo -e "${RED}❌ MarketDataAgent存在大量错误${NC}"
  echo "   可能原因: OKX API密钥无效或客户端初始化失败"
else
  echo "✅ MarketDataAgent错误数正常"
fi
echo ""

# 5. 检查状态接口
echo -e "${GREEN}[5] 状态接口检查${NC}"
STATUS_JSON=$(curl -s http://localhost:3000/status 2>/dev/null)
if echo "$STATUS_JSON" | grep -q '"version"'; then
  echo "✅ 状态接口可访问"
  
  # 检查是否为null
  NULL_COUNT=$(echo "$STATUS_JSON" | grep -c "null" || echo "0")
  if [ "$NULL_COUNT" -gt 5 ]; then
    echo -e "${YELLOW}⚠️  发现多个null值，可能存在对象未初始化${NC}"
  else
    echo "✅ 状态对象看起来正常"
  fi
else
  echo "❌ 状态接口无法访问或返回错误"
fi
echo ""

# 6. 检查知识库
echo -e "${GREEN}[6] 知识库检查${NC}"
DOC_COUNT=$(find knowledge -name "*.md" 2>/dev/null | wc -l)
echo "知识库文档数: $DOC_COUNT"
if [ "$DOC_COUNT" -lt 100 ]; then
  echo -e "${YELLOW}⚠️  知识库文档数不足 (需要100+触发学习)${NC}"
else
  echo "✅ 知识库文档数足够"
fi
echo ""

# 7. 检查学习引擎数据收集
echo -e "${GREEN}[7] 学习引擎数据收集检查${NC}"
if grep -q "learningEngine.trainingData.push" scripts/ultimate-v26-autonomous-learning.js; then
  echo "✅ 数据收集代码已插入"
else
  echo "❌ 数据收集代码缺失"
fi
echo ""

# 8. 检查定时器设置
echo -e "${GREEN}[8] 定时器检查${NC}"
INTERVAL_COUNT=$(grep -c "setInterval" scripts/ultimate-v26-autonomous-learning.js)
echo "发现的定时器数量: $INTERVAL_COUNT"
if [ "$INTERVAL_COUNT" -ge 3 ]; then
  echo "✅ 至少3个定时器 (学习/进化/迭代)"
else
  echo "⚠️  定时器数量不足"
fi
echo ""

# 9. 生成诊断报告
echo -e "${GREEN}[9] 生成诊断报告...${NC}"
REPORT_FILE="AUTONOMY-DIAGNOSIS-$(date +%Y%m%d-%H%M).md"
cat > "$REPORT_FILE" << EOF
# 自主系统诊断报告

## 诊断时间
$(date)

## 系统概览

### 进程状态
$(pm2 list --no-color | grep -E "libai-system|libai-bot" || echo "无进程")

### 服务状态
- Redis: $(redis-cli ping 2>/dev/null || echo "离线")
- HTTP服务: $(curl -s -o /dev/null -w "%{http_code}" http://localhost:3000/health || echo "无响应")

## 详细检查

### 1. 环境变量
- STEPFUN_API_KEY: ${STEPFUN_API_KEY:+已配置 (长度: ${#STEPFUN_API_KEY})}
- OKX_API_KEY: ${OKX_API_KEY:+已配置 (长度: ${#OKX_API_KEY})}
- REDIS_URL: ${REDIS_URL:-未设置}

### 2. MarketDataAgent错误
- 最近Polling error数: $ERROR_COUNT
- 可能原因: OKX API密钥无效、客户端未正确初始化、网络问题

### 3. 状态接口
- 可访问性: $(curl -s -o /dev/null -w "%{http_code}" http://localhost:3000/status)
- NULL值数量: $NULL_COUNT (过多null表明对象未正确初始化)

### 4. 知识库
- 文档总数: $DOC_COUNT
- 触发学习阈值: 100
- 状态: $(if [ "$DOC_COUNT" -lt 100 ]; then echo "不足"; else echo "足够"; fi)

### 5. 数据收集
- SignalAgent训练数据收集: $(grep -q "trainingData.push" scripts/ultimate-v26-autonomous-learning.js && echo "已启用" || echo "缺失")
- TraderAgent结果反馈: $(grep -q "learnFromExperience" scripts/ultimate-v26-autonomous-learning.js && echo "已启用" || echo "缺失")

### 6. 定时器配置
- 定时器总数: $INTERVAL_COUNT
- 期望: ≥3 (学习/进化/迭代各1个)

### 7. 核心指标
$(curl -s http://localhost:3000/status 2>/dev/null | jq '.metrics, .engines' 2>/dev/null || echo "无法获取指标")

## 问题识别

### 高优先级
1. MarketDataAgent持续错误
2. 状态接口返回大量null
3. 学习引擎数据可能不足

### 中优先级
1. OKX API密钥可能需要验证
2. 定时器是否在cluster worker中运行

## 修复建议

### 立即修复 (30分钟内)
1. 验证OKX API密钥有效性
2. 检查MarketDataAgent初始化逻辑
3. 确认cluster worker中的状态对象初始化

### 短期修复 (2小时内)
1. 添加更详细的错误日志
2. 实现状态对象在worker间的共享
3. 降低学习阈值至50 (临时)

### 中期优化 (24小时)
1. 实现完整的OKX REST API集成
2. 添加数据质量监控
3. 优化定时器触发条件

## 验证步骤

\`\`\`bash
# 1. 检查MarketDataAgent初始化
grep -A10 "initOKXRest" scripts/ultimate-v26-autonomous-learning.js

# 2. 验证OKX客户端
node -e "const {OKXClient}=require('./products/exchange-adapters/okx-client'); console.log(new OKXClient().getTicker('BTC-USDT'))"

# 3. 查看worker日志
pm2 logs libai-system --lines 100 | grep -E "MarketDataAgent|SignalAgent|TraderAgent"

# 4. 手动触发状态检查
curl http://localhost:3000/status | jq '.engines'
\`\`\`

## 预期结果

修复后应看到:
- MarketDataAgent Polling错误消失
- 状态接口返回有效数字而非null
- learningCycles在60分钟内开始增长
- knowledgeBaseSize开始增加

---

生成时间: $(date)
诊断者: C李白
EOF

echo "✅ 诊断报告已生成: $REPORT_FILE"

# 10. 建议的紧急修复
echo ""
echo -e "${GREEN}🔧 建议立即执行:${NC}"
echo ""
echo "1. 检查OKX客户端初始化:"
echo "   grep -A5 'initOKXRest' scripts/ultimate-v26-autonomous-learning.js"
echo ""
echo "2. 测试OKX客户端:"
echo "   node -e \"const {OKXClient}=require('./products/exchange-adapters/okx-client'); console.log(await new OKXClient().getTicker('BTC-USDT'))\""
echo ""
echo "3. 重启系统:"
echo "   pm2 restart libai-system"
echo ""
echo "4. 监控数据流:"
echo "   pm2 logs libai-system --lines 50 | grep -E 'market-data|signal|training'"
echo ""
echo -e "${YELLOW}⚠️  系统处于部分运行状态，需要立即干预！${NC}"
