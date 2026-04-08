#!/usr/bin/env bash
# 第七轮: 智能合约交易系统 + 多智能体通信系统 一键部署
# 作者: C李白 | 时间: 2026-04-01

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR/../.."

echo "=========================================="
echo "  第七轮系统整合部署"
echo "  时间: $(date '+%Y-%m-%d %H:%M:%S')"
echo "=========================================="
echo ""

# 颜色定义
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m'

log_info() {
    echo -e "${GREEN}[INFO]${NC} $1"
}

log_warn() {
    echo -e "${YELLOW}[WARN]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# 检查前置条件
check_prerequisites() {
    log_info "检查前置条件..."
    
    # Python
    if ! command -v python3 &> /dev/null; then
        log_error "Python3 未安装"
        exit 1
    fi
    PYTHON_VERSION=$(python3 --version | cut -d' ' -f2)
    log_info "Python版本: $PYTHON_VERSION"
    
    # Node.js
    if ! command -v node &> /dev/null; then
        log_error "Node.js 未安装"
        exit 1
    fi
    NODE_VERSION=$(node --version)
    log_info "Node.js版本: $NODE_VERSION"
    
    # npm
    if ! command -v npm &> /dev/null; then
        log_error "npm 未安装"
        exit 1
    fi
    
    # git
    if ! command -v git &> /dev/null; then
        log_error "git 未安装"
        exit 1
    fi
    
    # mcporter
    if ! command -v mcporter &> /dev/null; then
        log_warn "mcporter 未安装，尝试安装..."
        npm install -g mcporter
    fi
    
    log_info "前置条件检查完成"
}

# 部署 OKX Agent Trade Kit
deploy_okx() {
    log_info "部署 OKX Agent Trade Kit..."
    
    # 1. 安装全局MCP
    log_info "安装okx-trade-mcp..."
    npm install -g @okx_ai/okx-trade-mcp 2>&1 | tail -5
    
    # 2. 尝试安装Skills（可能失败）
    log_info "尝试安装OKX Skills..."
    npx skills add okx/agent-skills 2>/dev/null || log_warn "Skills安装失败（网络限制），可手动安装"
    
    # 3. 配置MCP
    log_info "配置MCP服务器..."
    mcporter config add okx-market \
        --command "npx" \
        --args "@okx_ai/okx-trade-mcp --modules market" \
        --transport stdio 2>/dev/null || log_warn "okx-market MCP配置已存在或失败"
    
    mcporter config add okx-trade \
        --command "npx" \
        --args "@okx_ai/okx-trade-mcp --modules swap" \
        --transport stdio 2>/dev/null || log_warn "okx-trade MCP配置已存在或失败"
    
    # 4. 更新openclaw.json
    if [ -f "$HOME/.openclaw/openclaw.json" ]; then
        log_info "更新OpenClaw配置..."
        cp "$HOME/.openclaw/openclaw.json" "$HOME/.openclaw/openclaw.json.backup.$(date +%s)"
        
        # 使用jq添加配置（如果可用）
        if command -v jq &> /dev/null; then
            jq '.skills.entries.okx-market = {"command": "npx", "args": ["@okx_ai/okx-trade-mcp", "--modules", "market"]}' \
                "$HOME/.openclaw/openclaw.json" > /tmp/openclaw.tmp && mv /tmp/openclaw.tmp "$HOME/.openclaw/openclaw.json"
            jq '.skills.entries.okx-trade = {"command": "npx", "args": ["@okx_ai/okx-trade-mcp", "--modules", "swap"]}' \
                "$HOME/.openclaw/openclaw.json" > /tmp/openclaw.tmp && mv /tmp/openclaw.tmp "$HOME/.openclaw/openclaw.json"
            log_info "OpenClaw配置已更新"
        else
            log_warn "jq未安装，请手动编辑 ~/.openclaw/openclaw.json 添加okx技能配置"
        fi
    else
        log_warn "OpenClaw配置文件不存在，跳过"
    fi
    
    log_info "OKX部署完成"
}

# 部署 OpenSpace 自我进化系统
deploy_openspace() {
    log_info "部署 OpenSpace 自我进化系统..."
    
    # 1. 克隆仓库
    if [ ! -d "/tmp/OpenSpace" ]; then
        log_info "克隆OpenSpace仓库..."
        git clone --depth 1 https://github.com/HKUDS/OpenSpace.git /tmp/OpenSpace 2>&1 | tail -3 || {
            log_warn "主仓库克隆失败，尝试镜像..."
            git clone --depth 1 https://hub.nuaa.cf/HKUDS/OpenSpace.git /tmp/OpenSpace 2>&1 | tail -3
        }
    else
        log_info "OpenSpace已存在，更新..."
        cd /tmp/OpenSpace && git pull --rebase 2>/dev/null || true
    fi
    
    # 2. 安装Python包
    if [ -f "/tmp/OpenSpace/setup.py" ]; then
        log_info "安装OpenSpace Python包..."
        pip install -e /tmp/OpenSpace --no-cache-dir 2>&1 | tail -5
    else
        log_warn "setup.py未找到，跳过Python安装"
    fi
    
    # 3. 配置MCP
    log_info "配置OpenSpace MCP..."
    mcporter config add openspace \
        --command "openspace-mcp" \
        --transport stdio 2>/dev/null || log_warn "openspace MCP配置已存在或失败"
    
    # 4. 复制Skills
    if [ -d "/tmp/OpenSpace/skills" ]; then
        log_info "复制OpenSpace Skills到OpenClaw..."
        mkdir -p "$HOME/.openclaw/workspace/skills"
        cp -r /tmp/OpenSpace/skills/* "$HOME/.openclaw/workspace/skills/" 2>/dev/null || true
    fi
    
    # 5. 设置环境变量
    log_info "设置环境变量..."
    cat >> "$HOME/.bashrc" << 'EOF'

# OpenSpace 环境变量
export OPENSPACE_HOST_SKILL_DIRS="$HOME/.openclaw/workspace/skills"
export OPENSPACE_WORKSPACE="/tmp/OpenSpace"
# export OPENSPACE_API_KEY="sk-xxx"  # 可选
EOF
    export OPENSPACE_HOST_SKILL_DIRS="$HOME/.openclaw/workspace/skills"
    export OPENSPACE_WORKSPACE="/tmp/OpenSpace"
    
    log_info "OpenSpace部署完成"
}

# 配置V30极速响应优化
configure_v30() {
    log_info "配置V30极速响应优化..."
    
    # 检查脚本是否存在
    if [ ! -f "scripts/ultimate-v30-fast-response.js" ]; then
        log_warn "V30脚本不存在，跳过配置"
        return
    fi
    
    # 备份openclaw.json
    if [ -f "$HOME/.openclaw/openclaw.json" ]; then
        cp "$HOME/.openclaw/openclaw.json" "$HOME/.openclaw/openclaw.json.v30-backup.$(date +%s)"
    fi
    
    # 使用jq更新配置
    if command -v jq &> /dev/null; then
        log_info "更新OpenClaw配置以启用V30优化..."
        
        # 设置temperature和reserveTokensFloor
        jq '.agents.defaults.models.stepfun_api/step-3.5-flash.params.temperature = 0.2 |
            .agents.defaults.models.stepfun_api/step-3.5-flash.params.reserveTokensFloor = 20000 |
            .agents.defaults.behavior.heartbeat = "30m" |
            .agents.defaults.behavior.responseOptimization = {
                "enabled": true,
                "script": "scripts/ultimate-v30-fast-response.js",
                "layers": [50, 200, 2000, 50000, 500000],
                "rules": ["start-report", "progress-report", "completion-report"]
            } |
            .tools.web.search.enabled = true' \
            "$HOME/.openclaw/openclaw.json" > /tmp/openclaw.json.new && mv /tmp/openclaw.json.new "$HOME/.openclaw/openclaw.json"
        
        log_info "V30配置已应用"
    else
        log_warn "jq未安装，请手动编辑配置"
    fi
    
    log_info "V30配置完成（需重启OpenClaw生效）"
}

# 创建Squad配置
create_squad_config() {
    log_info "创建Squad配置文件..."
    
    cat > config/squads.json << 'EOF'
{
  "squads": [
    {
      "id": "trading-squad",
      "name": "交易小队",
      "agents": ["cloud-libai", "c-libai", "q-libai"],
      "coordinator": "q-libai",
      "tasks": ["scan", "analyze", "execute", "report"]
    },
    {
      "id": "evolution-squad",
      "name": "进化小队",
      "agents": ["openspace", "openspace-1", "openspace-2"],
      "coordinator": "openspace",
      "tasks": ["learn", "improve", "share"]
    }
  ]
}
EOF
    
    log_info "Squad配置已创建: config/squads.json"
}

# 主流程
main() {
    check_prerequisites
    echo ""
    
    read -p "是否部署OKX系统? (y/n): " -n 1 -r && echo
    if [[ $REPLY =~ ^[Yy]$ ]]; then
        deploy_okx
        echo ""
    fi
    
    read -p "是否部署OpenSpace? (y/n): " -n 1 -r && echo
    if [[ $REPLY =~ ^[Yy]$ ]]; then
        deploy_openspace
        echo ""
    fi
    
    read -p "是否配置V30优化? (y/n): " -n 1 -r && echo
    if [[ $REPLY =~ ^[Yy]$ ]]; then
        configure_v30
        echo ""
    fi
    
    create_squad_config
    
    echo ""
    log_info "=========================================="
    log_info "第七轮部署脚本执行完成"
    log_info "=========================================="
    echo ""
    log_info "后续步骤:"
    echo "  1. 检查配置: cat ~/.openclaw/openclaw.json"
    echo "  2. 重启OpenClaw: openclaw gateway restart"
    echo "  3. 启动Squad: openclaw squad start trading-squad"
    echo "  4. 验证部署: openclaw status"
    echo ""
    log_info "详细文档: knowledge/第七轮整合部署方案.md"
}

main "$@"
