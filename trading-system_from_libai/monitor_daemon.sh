#!/bin/bash
LOG=/root/.openclaw/workspace/trading-system/logs/monitor_cron.log
mkdir -p $(dirname $LOG)
echo "[$(date '+%Y-%m-%d %H:%M:%S')] 监控守护进程启动 (10分钟间隔 · 并行扫描)" >> $LOG
while true; do
  cd /root/.openclaw/workspace/trading-system
  python3 lib/fast_scan.py >> $LOG 2>&1
  echo "[$(date '+%Y-%m-%d %H:%M:%S')] 下次扫描 10 分钟后" >> $LOG
  sleep 600
done
