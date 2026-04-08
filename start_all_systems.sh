#!/bin/bash
# 统一启动脚本 - 启动所有技能工具和核心系统
# 基于 libai-workspace 仓库完整内容

set -e

echo "========================================"
echo "  李白AI完整系统启动脚本"
echo "  启动时间: $(date '+%Y-%m-%d %H:%M:%S')"
echo "  工作区: /root/.openclaw/workspace"
echo "========================================"

# 颜色定义
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

# 统计变量
TOTAL_SKILLS=0
STARTED_SKILLS=0
FAILED_SKILLS=0

# 检查依赖
echo -e "${GREEN}[步骤 1/6] 检查系统依赖...${NC}"
if ! command -v node &> /dev/null; then
    echo -e "${RED}❌ Node.js 未安装${NC}"
    exit 1
fi
if ! command -v python3 &> /dev/null; then
    echo -e "${RED}❌ Python3 未安装${NC}"
    exit 1
fi
if ! command -v pm2 &> /dev/null; then
    echo -e "${YELLOW}⚠️  PM2 未安装，将使用 nohup 启动${NC}"
    USE_PM2=false
else
    USE_PM2=true
fi
echo -e "${GREEN}✅ 依赖检查通过${NC}"

# 创建必要的目录
echo -e "${GREEN}[步骤 2/6] 创建系统目录...${NC}"
mkdir -p logs pid data/{knowledge,cache,db}
echo -e "${GREEN}✅ 目录创建完成${NC}"

# 统计资源
echo -e "${GREEN}[步骤 3/6] 扫描可用资源...${NC}"
SKILL_DIR="./skills_from_libai"
SCRIPT_DIR="./scripts_from_libai"
TRADING_DIR="./trading-system_from_libai"
PRODUCTS_DIR="./products_from_libai"

if [ -d "$SKILL_DIR" ]; then
    SKILL_COUNT=$(find "$SKILL_DIR" -type f | wc -l)
    echo -e "  📦 技能工具: ${SKILL_COUNT} 个文件"
fi
if [ -d "$SCRIPT_DIR" ]; then
    SCRIPT_COUNT=$(find "$SCRIPT_DIR" -type f | wc -l)
    echo -e "  📜 部署脚本: ${SCRIPT_COUNT} 个文件"
fi
if [ -d "$TRADING_DIR" ]; then
    TRADING_COUNT=$(find "$TRADING_DIR" -type f | wc -l)
    echo -e "  💹 交易系统: ${TRADING_COUNT} 个文件"
fi
echo -e "${GREEN}✅ 资源扫描完成${NC}"

# 启动核心系统
echo -e "${GREEN}[步骤 4/6] 启动核心系统...${NC}"

# 4.1 启动自主五层核心系统
if [ -f "scripts_from_libai/autonomous-five-layer-v7-2.js" ]; then
    echo -e "  🚀 启动自主五层系统 v7.2..."
    if [ "$USE_PM2" = true ]; then
        pm2 start scripts_from_libai/autonomous-five-layer-v7-2.js --name libai-core --node-args="--max-old-space-size=4096"
    else
        nohup node scripts_from_libai/autonomous-five-layer-v7-2.js > logs/core.log 2>&1 &
        echo $! > pid/core.pid
    fi
    echo -e "${GREEN}  ✅ 核心系统已启动${NC}"
    ((STARTED_SKILLS++))
else
    echo -e "${YELLOW}  ⚠️  核心系统文件未找到${NC}"
    ((FAILED_SKILLS++))
fi

# 4.2 启动自主进化引擎
if [ -f "scripts_from_libai/start-autonomous-engines.sh" ]; then
    echo -e "  🧬 启动自主进化引擎..."
    bash scripts_from_libai/start-autonomous-engines.sh || true
    echo -e "${GREEN}  ✅ 进化引擎已启动${NC}"
    ((STARTED_SKILLS++))
fi

# 4.3 启动交易系统扫描守护进程
if [ -d "$TRADING_DIR" ]; then
    echo -e "  💰 启动交易系统..."
    # 查找主要交易脚本
    TRADING_SCRIPT=$(find "$TRADING_DIR" -name "*.js" -type f | grep -E "scan|trade|monitor" | head -1)
    if [ -n "$TRADING_SCRIPT" ]; then
        if [ "$USE_PM2" = true ]; then
            pm2 start "$TRADING_SCRIPT" --name trading-system --node-args="--max-old-space-size=2048"
        else
            nohup node "$TRADING_SCRIPT" > logs/trading.log 2>&1 &
            echo $! > pid/trading.pid
        fi
        echo -e "${GREEN}  ✅ 交易系统已启动${NC}"
        ((STARTED_SKILLS++))
    fi
fi

# 启动所有技能工具
echo -e "${GREEN}[步骤 5/6] 启动技能工具...${NC}"

# 遍历所有技能目录
if [ -d "$SKILL_DIR" ]; then
    for skill_dir in "$SKILL_DIR"/*/; do
        skill_name=$(basename "$skill_dir")
        # 跳过特殊目录
        if [[ "$skill_name" == "node_modules" || "$skill_name" == ".git" ]]; then
            continue
        fi

        # 查找入口文件
        entry_file=$(find "$skill_dir" -name "index.js" -o -name "main.js" -o -name "*.py" | head -1)

        if [ -n "$entry_file" ]; then
            echo -e "  🔧 启动技能: $skill_name"
            skill_pm2_name="skill-$skill_name"

            if [ "$USE_PM2" = true ]; then
                pm2 start "$entry_file" --name "$skill_pm2_name" --node-args="--max-old-space-size=512" || true
            else
                nohup node "$entry_file" > logs/skill-$skill_name.log 2>&1 &
                echo $! > "pid/skill-$skill_name.pid"
            fi

            echo -e "${GREEN}  ✅ $skill_name${NC}"
            ((STARTED_SKILLS++))
        else
            echo -e "${YELLOW}  ⚠️  跳过: $skill_name (无入口文件)${NC}"
        fi
        ((TOTAL_SKILLS++))
    done
fi

# 启动监控和调度系统
echo -e "${GREEN}[步骤 6/6] 启动监控调度系统...${NC}"

# 6.1 性能监控脚本
if [ -f "scripts_from_libai/performance_monitor.py" ]; then
    echo -e "  📊 启动性能监控..."
    python3 scripts_from_libai/performance_monitor.py > logs/performance.log 2>&1 &
    echo $! > pid/performance.pid
    echo -e "${GREEN}  ✅ 性能监控已启动${NC}"
fi

# 6.2 系统优化器
if [ -f "scripts_from_libai/system_optimizer.py" ]; then
    echo -e "  ⚡ 启动系统优化器..."
    python3 scripts_from_libai/system_optimizer.py > logs/optimizer.log 2>&1 &
    echo $! > pid/optimizer.pid
    echo -e "${GREEN}  ✅ 系统优化器已启动${NC}"
fi

# 6.3 智能调度器
if [ -f "scripts_from_libai/smart_scheduler.py" ]; then
    echo -e "  📅 启动智能调度器..."
    python3 scripts_from_libai/smart_scheduler.py > logs/scheduler.log 2>&1 &
    echo $! > pid/scheduler.pid
    echo -e "${GREEN}  ✅ 智能调度器已启动${NC}"
fi

# 生成系统状态报告
echo ""
echo "========================================"
echo "  启动完成!"
echo "========================================"
echo ""
echo "📊 统计信息:"
echo "  总技能数: $TOTAL_SKILLS"
echo "  已启动: $STARTED_SKILLS"
echo "  失败: $FAILED_SKILLS"
echo ""

# 检查进程状态
echo "🔍 进程状态检查:"
if [ "$USE_PM2" = true ]; then
    pm2 list --no-color | head -20
else
    echo "  后台进程 (PID文件):"
    ls -1 pid/ 2>/dev/null | while read pidfile; do
        pid=$(cat "pid/$pidfile" 2>/dev/null)
        if [ -n "$pid" ] && kill -0 "$pid" 2>/dev/null; then
            echo "  ✅ $pidfile: $pid"
        else
            echo "  ❌ $pidfile: 未运行"
        fi
    done
fi

echo ""
echo "📋 日志位置:"
echo "  核心日志: logs/core.log"
echo "  技能日志: logs/skill-*.log"
echo "  交易日志: logs/trading.log"
echo "  监控日志: logs/performance.log"
echo ""

echo "🌐 健康检查 (等待10秒后):"
sleep 10
if command -v curl &> /dev/null; then
    curl -s http://localhost:3000/health 2>/dev/null || echo "  ⚠️  健康检查端点未就绪"
    curl -s http://localhost:3000/status 2>/dev/null || echo "  ⚠️  状态端点未就绪"
fi

echo ""
echo "========================================"
echo "  ✅ 系统启动流程完成!"
echo "========================================"
echo ""
echo "📖 后续操作:"
echo "  1. 查看日志: tail -f logs/core.log"
echo "  2. 检查状态: curl http://localhost:3000/status"
echo "  3. 监控性能: tail -f logs/performance.log"
echo "  4. 停止系统: ./scripts/stop-all.sh"
echo ""
