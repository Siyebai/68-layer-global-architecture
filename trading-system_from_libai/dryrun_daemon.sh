#!/bin/bash
LOG=/root/.openclaw/workspace/trading-system/logs/dryrun_cron.log
mkdir -p $(dirname $LOG)
echo "[$(date '+%Y-%m-%d %H:%M:%S')] dryRun 守护进程启动 (15分钟间隔)" >> $LOG
while true; do
  echo "[$(date '+%Y-%m-%d %H:%M:%S')] 扫描中..." >> $LOG
  cd /root/.openclaw/workspace/trading-system
  python3 dryrun_simulator.py >> $LOG 2>&1
  echo "[$(date '+%Y-%m-%d %H:%M:%S')] 完成，15分钟后继续" >> $LOG
  sleep 900
done
