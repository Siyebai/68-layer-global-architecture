#!/bin/bash
# 批量启动所有技能工具
# 基于 libai-workspace 的 82 个技能

set -e

WORKDIR="/root/.openclaw/workspace"
SKILL_DIR="$WORKDIR/skills_from_libai"
LOG_DIR="$WORKDIR/logs"
PID_DIR="$WORKDIR/pid"

echo "=========================================="
echo "  批量启动技能工具"
echo "  开始时间: $(date)"
echo "=========================================="

# 创建目录
mkdir -p "$LOG_DIR" "$PID_DIR"

# 统计
TOTAL=0
STARTED=0
FAILED=0

# 遍历所有技能目录
for skill_dir in "$SKILL_DIR"/*/; do
    skill_name=$(basename "$skill_dir")
    
    # 跳过已启动的特殊技能
    if [[ "$skill_name" == "feishu-integration" ]]; then
        continue
    fi
    
    # 查找入口文件
    entry=$(find "$skill_dir" -name "index.js" -o -name "main.js" -o -name "*.py" | head -1)
    
    if [ -z "$entry" ]; then
        echo "⚠️  $skill_name: 无入口文件，跳过"
        continue
    fi
    
    # 启动技能
    log_file="$LOG_DIR/skill-$skill_name.log"
    pid_file="$PID_DIR/skill-$skill_name.pid"
    
    echo -n "启动 $skill_name... "
    
    case "$entry" in
        *.js)
            nohup node "$entry" >> "$log_file" 2>&1 &
            ;;
        *.py)
            nohup python3 "$entry" >> "$log_file" 2>&1 &
            ;;
        *)
            echo "未知类型"
            continue
            ;;
    esac
    
    echo $! > "$pid_file"
    
    # 验证是否启动成功
    sleep 1
    if kill -0 $(cat "$pid_file") 2>/dev/null; then
        echo "✅"
        ((STARTED++))
    else
        echo "❌"
        ((FAILED++))
    fi
    
    ((TOTAL++))
done

echo ""
echo "=========================================="
echo "  批量启动完成"
echo "  总计: $TOTAL"
echo "  成功: $STARTED"
echo "  失败: $FAILED"
echo "  时间: $(date)"
echo "=========================================="

# 检查所有运行的技能进程
echo ""
echo "🔍 运行中的技能进程:"
ps -o pid,cmd -C node -C python3 2>/dev/null | grep -E "skills_from_libai|libai-workspace" | head -20

echo ""
echo "📊 日志位置: $LOG_DIR"
echo "📁 PID文件: $PID_DIR"
echo ""
