#!/bin/bash
case "$1" in
  "import") node scripts/import-knowledge.js ;;
  "expand") node scripts/expand-knowledge-deep.js ;;
  "stats") 
    echo "节点: $(redis-cli -h 127.0.0.1 -p 6379 scard 'knowledge:nodes' 2>/dev/null || echo 0)"
    echo "关系: $(redis-cli -h 127.0.0.1 -p 6379 scard 'knowledge:relations' 2>/dev/null || echo 0)"
    ;;
  *) echo "用法: $0 {import|expand|stats}" ;;
esac
