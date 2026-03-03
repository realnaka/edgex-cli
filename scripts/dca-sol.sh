#!/bin/bash
# SOL DCA — 每隔指定间隔市价买入最小数量的 SOL
# 用法: ./dca-sol.sh [间隔秒数] [总次数]
# 停止: Ctrl+C 或 kill $(cat /tmp/dca-sol.pid)

INTERVAL=${1:-60}
MAX_ROUNDS=${2:-10}
LOG_FILE="/tmp/dca-sol.log"

echo $$ > /tmp/dca-sol.pid
echo "========================================" | tee -a "$LOG_FILE"
echo "SOL DCA 启动" | tee -a "$LOG_FILE"
echo "间隔: ${INTERVAL}s | 总次数: ${MAX_ROUNDS}" | tee -a "$LOG_FILE"
echo "PID: $$ | 停止: kill \$(cat /tmp/dca-sol.pid)" | tee -a "$LOG_FILE"
echo "日志: $LOG_FILE" | tee -a "$LOG_FILE"
echo "========================================" | tee -a "$LOG_FILE"

round=0
while [ $round -lt $MAX_ROUNDS ]; do
  round=$((round + 1))
  ts=$(date '+%Y-%m-%d %H:%M:%S')

  echo "" | tee -a "$LOG_FILE"
  echo "[$ts] 第 ${round}/${MAX_ROUNDS} 次买入..." | tee -a "$LOG_FILE"

  result=$(edgex order create SOL buy market 0.3 -y 2>&1)
  exit_code=$?

  echo "$result" | tee -a "$LOG_FILE"

  if [ $exit_code -ne 0 ]; then
    echo "[$ts] 下单失败 (exit=$exit_code)，停止执行" | tee -a "$LOG_FILE"
    break
  fi

  if [ $round -lt $MAX_ROUNDS ]; then
    echo "[$ts] 等待 ${INTERVAL}s..." | tee -a "$LOG_FILE"
    sleep $INTERVAL
  fi
done

ts=$(date '+%Y-%m-%d %H:%M:%S')
echo "" | tee -a "$LOG_FILE"
echo "[$ts] DCA 完成，共执行 ${round} 次" | tee -a "$LOG_FILE"
rm -f /tmp/dca-sol.pid
