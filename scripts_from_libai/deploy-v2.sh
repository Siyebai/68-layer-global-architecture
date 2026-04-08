#!/bin/bash
#
# 合约交易系统 V2.0 一键部署脚本
# 支持 Docker + Docker Compose 完整部署
#
# 使用方法:
#   chmod +x deploy-v2.sh
#   ./deploy-v2.sh
#
# 或指定环境:
#   ENV=production ./deploy-v2.sh
#

set -e  # 遇到错误退出

# 颜色定义
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

# 配置
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR/.."

ENV_FILE=".env"
DOCKER_COMPOSE_FILE="docker-compose.yml"

# 日志函数
log_info()   { echo -e "${CYAN}[INFO]${NC} $1"; }
log_success(){ echo -e "${GREEN}[SUCCESS]${NC} $1"; }
log_warn()   { echo -e "${YELLOW}[WARN]${NC} $1"; }
log_error()  { echo -e "${RED}[ERROR]${NC} $1"; }

# 打印标题
print_header() {
    echo ""
    echo -e "${CYAN}============================================================${NC}"
    echo -e "${CYAN}  $1${NC}"
    echo -e "${CYAN}============================================================${NC}"
    echo ""
}

# 检查命令是否存在
command_exists() {
    command -v "$1" >/dev/null 2>&1
}

# 等待服务健康
wait_for_service() {
    local service_name="$1"
    local check_cmd="$2"
    local max_attempts=30
    local attempt=1

    log_info "等待 ${service_name} 就绪..."

    while [ $attempt -le $max_attempts ]; do
        if eval "$check_cmd" >/dev/null 2>&1; then
            log_success "${service_name} 已就绪"
            return 0
        fi
        sleep 2
        attempt=$((attempt + 1))
    done

    log_warn "${service_name} 未在预期时间内就绪 (尝试 ${max_attempts} 次)"
    return 1
}

# 1. 环境检查
check_environment() {
    print_header "1️⃣ 环境检查"

    # 检查 Docker
    if ! command_exists docker; then
        log_error "Docker 未安装，请先安装 Docker"
        exit 1
    fi
    log_success "Docker 已安装: $(docker --version | head -1)"

    # 检查 Docker Compose
    if ! command_exists docker-compose && ! docker compose version >/dev/null 2>&1; then
        log_error "Docker Compose 未安装"
        exit 1
    fi
    log_success "Docker Compose 已就绪"

    # 检查 Node.js (本地构建需要)
    if ! command_exists node; then
        log_warn "Node.js 未安装 (容器化部署可忽略)"
    else
        log_success "Node.js: $(node --version)"
    fi
}

# 2. 配置文件检查
check_configs() {
    print_header "2️⃣ 配置文件检查"

    local required_files=(
        "docker-compose.yml:Docker Compose 配置"
        "Dockerfile.contract:Dockerfile"
        "config/contract-trading.yaml:合约交易配置"
        ".env:环境变量文件"
        "nginx/nginx.conf:Nginx 配置"
        "prometheus/prometheus.yml:Prometheus 配置"
        "products/contract-trading-system/contract-trading-system-v2.js:主程序"
    )

    local all_ok=true
    for item in "${required_files[@]}"; do
        IFS=':' read -r file desc <<< "$item"
        if [ -f "$file" ]; then
            log_success "${desc}: ${file}"
        else
            log_error "${desc} 缺失: ${file}"
            all_ok=false
        fi
    done

    if [ "$all_ok" = false ]; then
        log_error "配置文件检查失败"
        exit 1
    fi
}

# 3. 环境变量准备
prepare_env() {
    print_header "3️⃣ 环境变量准备"

    if [ ! -f "$ENV_FILE" ]; then
        log_warn ".env 文件不存在，从 .env.example 创建..."
        if [ -f ".env.example" ]; then
            cp .env.example .env
            log_success ".env 已创建"
        else
            log_error ".env.example 不存在"
            exit 1
        fi
    fi

    # 检查关键变量
    local missing_vars=()
    local placeholder_vars=()

    while IFS='=' read -r key value; do
        if [[ $key =~ ^[A-Z_]+$ ]] && [[ ! $value =~ ^[[:space:]]*# ]]; then
            if [ -z "$value" ]; then
                missing_vars+=("$key")
            elif [[ $value == *"your_"* ]] || [[ $value == *"placeholder"* ]]; then
                placeholder_vars+=("$key")
            fi
        fi
    done < "$ENV_FILE"

    if [ ${#missing_vars[@]} -gt 0 ]; then
        log_warn "缺失环境变量: ${missing_vars[*]}"
    fi

    if [ ${#placeholder_vars[@]} -gt 0 ]; then
        log_warn "占位符变量 (需修改): ${placeholder_vars[*]}"
    fi

    if [ ${#missing_vars[@]} -gt 0 ] || [ ${#placeholder_vars[@]} -gt 0 ]; then
        log_warn "请编辑 .env 文件配置真实值"
        log_info "是否继续? (y/N): "
        read -r confirm
        if [[ ! $confirm =~ ^[Yy]$ ]]; then
            exit 0
        fi
    fi

    log_success "环境变量检查完成"
}

# 4. 构建镜像
build_images() {
    print_header "4️⃣ 构建 Docker 镜像"

    log_info "开始构建 (可能需要几分钟)..."

    if docker compose version >/dev/null 2>&1; then
        docker compose build --progress=plain
    else
        docker-compose build
    fi

    if [ $? -eq 0 ]; then
        log_success "镜像构建完成"
    else
        log_error "镜像构建失败"
        exit 1
    fi
}

# 5. 启动服务
start_services() {
    print_header "5️⃣ 启动服务"

    log_info "使用 Docker Compose 启动所有服务..."

    if docker compose version >/dev/null 2>&1; then
        docker compose up -d
    else
        docker-compose up -d
    fi

    if [ $? -eq 0 ]; then
        log_success "服务启动命令已执行"
    else
        log_error "服务启动失败"
        exit 1
    fi
}

# 6. 等待就绪
wait_for_services() {
    print_header "6️⃣ 等待服务就绪"

    local services=(
        "PostgreSQL:tcp://localhost:5432"
        "Redis:tcp://localhost:6379"
        "合约交易系统:http://localhost:3000/health"
        "Prometheus:http://localhost:9091"
        "Grafana:http://localhost:3001"
    )

    for service in "${services[@]}"; do
        IFS=':' read -r name check_type <<< "$service"
        if [ "$check_type" = "tcp" ]; then
            # TCP 检查
            host_port="${check_type##tcp://}"
            if command_exists nc; then
                wait_for_service "$name" "nc -z $host_port"
            else
                wait_for_service "$name" "timeout 1 bash -c 'cat < /dev/null > /dev/tcp/$host_port'"
            fi
        else
            # HTTP 检查
            wait_for_service "$name" "curl -f -s -o /dev/null $check_type"
        fi
    done
}

# 7. 运行测试
run_tests() {
    print_header "7️⃣ 运行系统测试"

    if [ -f "scripts/test-contract-v2.js" ]; then
        log_info "运行合约交易系统 V2.0 测试..."
        node scripts/test-contract-v2.js
    else
        log_warn "测试脚本不存在，跳过测试"
    fi
}

# 8. 显示访问信息
show_access_info() {
    print_header "🎉 部署完成"

    cat <<EOF
${GREEN}服务地址:${NC}
  主API:        http://localhost:3000
  健康检查:     http://localhost:3000/health
  系统状态:     http://localhost:3000/status
  合约状态:     http://localhost:3000/contract-status
  Prometheus:   http://localhost:9091
  Grafana:      http://localhost:3001 (admin/admin)
  Jaeger:       http://localhost:16686
  日志:         docker compose logs -f <service>

${YELLOW}常用命令:${NC}
  查看所有容器: docker compose ps
  查看日志:     docker compose logs -f [service]
  重启服务:     docker compose restart [service]
  停止服务:     docker compose down
  进入容器:     docker compose exec contract-trader sh
  系统状态:     curl http://localhost:3000/status | jq .

${CYAN}下一步:${NC}
  1. 配置 .env 文件中的真实 API 密钥
  2. 访问 Grafana 配置仪表盘 (添加 Prometheus 数据源)
  3. 查看系统状态确认运行正常
  4. 配置 SSL 证书 (生产环境)
  5. 设置监控告警规则

${YELLOW}注意事项:${NC}
  - 首次运行请先在 OKX 测试网验证
  - 监控系统资源使用 (Docker stats)
  - 定期备份数据库 (docker compose exec postgres pg_dump)
  - 查看知识库文档了解详细设计

EOF
}

# 主函数
main() {
    print_header "📦 合约交易系统 V2.0 一键部署"

    log_info "开始时间: $(date '+%Y-%m-%d %H:%M:%S')"

    check_environment
    check_configs
    prepare_env
    build_images
    start_services
    wait_for_services
    run_tests
    show_access_info

    log_info "结束时间: $(date '+%Y-%m-%d %H:%M:%S')"
}

# 运行
main "$@"