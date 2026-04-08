#!/bin/bash
echo "=== 应用性能优化 ==="
node scripts/performance/apply-optimizations.js || true
pm2 restart libai-system
sleep 5
curl -s http://localhost:3000/status/super-auto | head -20 || true
echo "✅ 优化完成"
