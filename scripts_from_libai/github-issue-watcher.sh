#!/bin/bash
# GitHub Issue 通信检查器 - Bash版本
# 用法: AGENT_ID=cloud-libai ./scripts/github-issue-watcher.sh

AGENT_ID=${AGENT_ID:-unknown}
ISSUE_NUMBER=3
CHECK_STATE_FILE="memory/github-last-check-${AGENT_ID}.json"

echo "[$AGENT_ID] GitHub Issue检查器启动 (Issue #$ISSUE_NUMBER)"

# 加载上次检查状态
LAST_CHECK_ID=""
if [ -f "$CHECK_STATE_FILE" ]; then
    LAST_CHECK_ID=$(cat "$CHECK_STATE_FILE" | grep -o '"lastCommentId":"[^"]*"' | cut -d'"' -f4)
fi

# 获取Issue评论
gh issue view $ISSUE_NUMBER --comments 2>/dev/null > /tmp/issue-${ISSUE_NUMBER}-comments.md
if [ $? -ne 0 ]; then
    echo "[$AGENT_ID] 获取Issue失败，请检查gh认证"
    exit 1
fi

# 简化检查：查找包含自己ID的 lines
echo "[$AGENT_ID] 检查新消息..."
grep -E "\[${AGENT_ID}\]|@${AGENT_ID}" /tmp/issue-${ISSUE_NUMBER}-comments.md | tail -10 | while read line; do
    echo "[$AGENT_ID] 发现任务: $line"
    
    # 根据内容执行相应操作
    case "$line" in
        *"STATUS"*|*"状态"*)
            echo "[$AGENT_ID] 汇报状态..."
            # 这里可以添加状态收集逻辑
            ;;
        *"EXEC"*|*"执行"*)
            echo "[$AGENT_ID] 执行任务..."
            # 解析并执行任务
            ;;
        *)
            echo "[$AGENT_ID] 收到消息，待处理"
            ;;
    esac
done

# 更新检查记录
echo "{\"lastCommentId\":\"$(date +%s)\",\"lastCheck\":\"$(date '+%Y-%m-%d %H:%M:%S')\"}" > "$CHECK_STATE_FILE"

echo "[$AGENT_ID] 检查完成，下次检查30分钟后"
