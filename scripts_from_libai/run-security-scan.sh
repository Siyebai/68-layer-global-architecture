#!/bin/bash
echo "=== 安全扫描 ==="
node scripts/security-integration/v7.2-vulnerability-scanner.js --full --output scan-report-$(date +%Y%m%d).json
echo "✅ 扫描完成"
