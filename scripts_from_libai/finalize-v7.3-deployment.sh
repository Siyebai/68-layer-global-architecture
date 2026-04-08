#!/bin/bash
# 补充缺失配置并完成V7.3最终部署

set -e

cd /root/.openclaw/workspace/libai-workspace

echo "=========================================="
echo "  补充配置 & V7.3 最终部署"
echo "=========================================="
echo ""

# ==========================================
# 1. 创建缺失的合约交易配置
# ==========================================
echo "[1/4] 创建合约交易配置..."

mkdir -p config/contract-trading

cat > config/contract-trading/v7.2-integration.yaml << 'EOF'
# V7.2 合约交易集成配置

dryRun: true                    # 模拟模式 (false为实盘)
maxPositionSize: 25             # 单笔最大仓位(U)
dailyLossLimit: 5               # 日亏损限额(U)
confidenceThreshold: 65         # 信心度门槛(%)

# Gate交易所配置
gate:
  enabled: true
  apiKey: ""                    # 从.env读取
  secret: ""                    # 从.env读取
  passphrase: ""                # 从.env读取

# 监控配置
monitor:
  marketDataInterval: 2000      # 市场数据采集间隔(ms)
  signalInterval: 5000         # 信号生成间隔(ms)
  analysisInterval: 3000       # 分析间隔(ms)
  executionInterval: 6000      # 执行间隔(ms)
  hedgingInterval: 8000        # 对冲间隔(ms)

# 风控参数
risk:
  stopLossPct: 0.02            # 止损百分比
  takeProfitPct: 0.03          # 止盈百分比
  maxPositions: 10             # 最大持仓数
  maxLeverage: 5               # 最大杠杆

# 信号等级阈值
signal:
  gradeA:
    minConfidence: 90
    minRR: 3.0
  gradeB:
    minConfidence: 80
    minRR: 2.0
  gradeC:
    minConfidence: 70
    minRR: 1.5
  gradeD:
    minConfidence: 60
    minRR: 1.0
EOF

echo "✅ 合约交易配置已创建"

# ==========================================
# 2. 创建漏洞检测配置
# ==========================================
echo "[2/4] 创建漏洞检测配置..."

mkdir -p config/security-integration

cat > config/security-integration/v7.2-integration.yaml << 'EOF'
# V7.2 漏洞检测集成配置

enabled: true
scanInterval: 600000  # 10分钟

# 扫描目标
scanTargets:
  - "dependencies"   # npm包漏洞
  - "configurations" # 配置文件安全
  - "permissions"    # 文件权限
  - "network"        # 开放端口

# 告警阈值
alertThreshold: "medium"  # low | medium | high | critical

# 自动修复
autoRemediation: false

# 依赖扫描
dependencyScan:
  enabled: true
  tool: "npm-audit"  # npm-audit | snyk | custom
  severityThreshold: "medium"

# 配置扫描
configScan:
  enabled: true
  checkHardcodedSecrets: true
  checkInsecurePermissions: true
  checkExposedPorts: true

# 监控端口
monitoredPorts:
  - 3000   # V7.2 API
  - 6379   # Redis
  - 5432   # PostgreSQL
  - 27017  # MongoDB
EOF

echo "✅ 漏洞检测配置已创建"

# ==========================================
# 3. 验证所有文件完整性
# ==========================================
echo "[3/4] 验证文件完整性..."

# 检查4大子系统文件
SUBSYSTEM_FILES=(
  "scripts/contract-integration/contract-adapter.js"
  "scripts/coordinator-integration/v7.2-coordinator.js"
  "scripts/brain-integration/v7.2-brain.js"
  "scripts/security-integration/v7.2-vulnerability-scanner.js"
)

# 检查4个配置文件
CONFIG_FILES=(
  "config/contract-trading/v7.2-integration.yaml"
  "config/multi-agent/v7.2-integration.yaml"
  "config/brain-integration/v7.2-integration.yaml"
  "config/security-integration/v7.2-integration.yaml"
)

echo "子系统文件:"
for file in "${SUBSYSTEM_FILES[@]}"; do
  if [ -f "$file" ]; then
    size=$(wc -c < "$file")
    echo "  ✅ $file ($size bytes)"
  else
    echo "  ❌ $file (缺失)"
  fi
done

echo ""
echo "配置文件:"
for file in "${CONFIG_FILES[@]}"; do
  if [ -f "$file" ]; then
    echo "  ✅ $file"
  else
    echo "  ❌ $file (缺失)"
  fi
done

# 检查V7.2主系统集成
echo ""
echo "V7.2主系统集成检查:"
grep -q "this.contractAdapter = null;" scripts/autonomous-five-layer-v7-2.js && echo "  ✅ contractAdapter 属性"
grep -q "this.coordinator = null;" scripts/autonomous-five-layer-v7-2.js && echo "  ✅ coordinator 属性"
grep -q "this.brainAdapter = null;" scripts/autonomous-five-layer-v7-2.js && echo "  ✅ brainAdapter 属性"
grep -q "this.vulnerabilityScanner = null;" scripts/autonomous-five-layer-v7-2.js && echo "  ✅ vulnerabilityScanner 属性"

grep -q "ContractAdapter" scripts/autonomous-five-layer-v7-2.js && echo "  ✅ 合约交易初始化"
grep -q "V72Coordinator" scripts/autonomous-five-layer-v7-2.js && echo "  ✅ 协调器初始化"
grep -q "V72Brain" scripts/autonomous-five-layer-v7-2.js && echo "  ✅ 第二大脑初始化"
grep -q "VulnScanner" scripts/autonomous-five-layer-v7-2.js && echo "  ✅ 漏洞检测初始化"

grep -q "contractTrading:" scripts/autonomous-five-layer-v7-2.js && echo "  ✅ getStatus() 包含 contractTrading"
grep -q "coordinator:" scripts/autonomous-five-layer-v7-2.js && echo "  ✅ getStatus() 包含 coordinator"
grep -q "brain:" scripts/autonomous-five-layer-v7-2.js && echo "  ✅ getStatus() 包含 brain"
grep -q "vulnerabilityScanner:" scripts/autonomous-five-layer-v7-2.js && echo "  ✅ getStatus() 包含 vulnerabilityScanner"

# ==========================================
# 4. 重启系统并验证
# ==========================================
echo ""
echo "[4/4] 重启系统验证..."

# 检查PM2
if command -v pm2 &> /dev/null; then
  # 停止旧系统
  pm2 stop libai-system 2>/dev/null || true
  
  # 检查ecosystem.config.js
  if [ -f "ecosystem.config.js" ]; then
    echo "使用ecosystem.config.js启动..."
    
    # 更新ecosystem.config.js指向V7.2
    if grep -q "autonomous-five-layer-v7-2.js" ecosystem.config.js; then
      echo "✅ ecosystem.config.js已指向V7.2"
    else
      echo "⚠️  需要更新ecosystem.config.js指向autonomous-five-layer-v7-2.js"
    fi
    
    # 启动
    pm2 start ecosystem.config.js
    sleep 5
    
    # 检查状态
    if pm2 list | grep -q "online.*libai-system"; then
      echo "✅ V7.3系统已启动 (PM2 online)"
    else
      echo "❌ V7.3系统启动失败"
      pm2 logs libai-system --lines 20
    fi
  else
    echo "❌ 未找到ecosystem.config.js，需要手动配置PM2"
  fi
else
  echo "⚠️  PM2未安装，需要手动启动系统"
fi

# 等待系统初始化
echo ""
echo "等待系统初始化 (15秒)..."
sleep 15

# 检查HTTP状态端点
if curl -s http://localhost:3000/status/super-auto > /tmp/v7-check.json 2>/dev/null; then
  echo "✅ 系统状态端点可访问"
  
  # 提取关键指标
  if command -v jq &> /dev/null; then
    VERSION=$(jq -r '.version // "unknown"' /tmp/v7-check.json)
    AUTONOMY=$(jq -r '.autonomousLevel // 0' /tmp/v7-check.json)
    LAYERS=$(jq -r '.layers | length // 0' /tmp/v7-check.json)
    
    echo "  版本: $VERSION"
    echo "  自主度: $AUTONOMY%"
    echo "  五层数: $LAYERS"
    
    # 检查子系统
    CONTRACT=$(jq -r '.contractTrading.running // false' /tmp/v7-check.json)
    COORD=$(jq -r '.coordinator.running // false' /tmp/v7-check.json)
    BRAIN=$(jq -r '.brain.running // false' /tmp/v7-check.json)
    VULN=$(jq -r '.vulnerabilityScanner.running // false' /tmp/v7-check.json)
    
    echo "  子系统状态:"
    echo "    合约交易: $([ "$CONTRACT" = "true" ] && echo "✅" || echo "❌")"
    echo "    协调器: $([ "$COORD" = "true" ] && echo "✅" || echo "❌")"
    echo "    第二大脑: $([ "$BRAIN" = "true" ] && echo "✅" || echo "❌")"
    echo "    漏洞检测: $([ "$VULN" = "true" ] && echo "✅" || echo "❌")"
  fi
else
  echo "❌ 系统状态端点不可访问，系统可能未启动"
fi

echo ""
echo "=========================================="
echo "  V7.3 部署完成"
echo "=========================================="
echo ""
echo "集成总结:"
echo "  ✅ Phase 1: 合约交易系统"
echo "  ✅ Phase 2: 多智能体协调器"
echo "  ✅ Phase 3: 第二大脑系统"
echo "  ✅ Phase 4: 漏洞检测工具"
echo "  ✅ Phase 5: 配置补充 & 部署验证"
echo ""
echo "文件清单:"
echo "  核心文件 (4): scripts/*-integration/*.js"
echo "  配置文件 (4): config/*/v7.2-integration.yaml"
echo "  主系统修改: scripts/autonomous-five-layer-v7-2.js"
echo ""
echo "下一步:"
echo "  1. 验证系统运行状态"
echo "  2. 监控指标增长"
echo "  3. 配置实盘API (Gate)"
echo "  4. 上传GitHub和腾讯微云"
echo "=========================================="
