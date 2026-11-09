#!/usr/bin/env bash
# ====================================================
# 🛑 Tora StoryVDO / Huobao Drama - Stop Script
# ====================================================

set -e
cd "$(dirname "$0")"

# Colors for terminal output
BOLD="\033[1m"
GREEN="\033[0;32m"
YELLOW="\033[1;33m"
CYAN="\033[0;36m"
RESET="\033[0m"

echo -e "${BOLD}${YELLOW}"
echo "======================================================"
echo "  🛑 Tora StoryVDO - กำลังปิดการทำงานทุก Service..."
echo "======================================================"
echo -e "${RESET}"

kill_port() {
  local port=$1
  local name=$2
  local pids=$(lsof -ti :$port 2>/dev/null || true)
  if [ -n "$pids" ]; then
    echo -e "  - กำลังหยุด $name บนพอร์ต $port (PID: $pids)..."
    kill -9 $pids 2>/dev/null || true
  else
    echo -e "  - พอร์ต $port ($name) ปิดอยู่แล้ว"
  fi
}

kill_port 5679 "Backend"
kill_port 3013 "Frontend"

echo -e "\n${GREEN}✅ ปิดบริการ Tora StoryVDO เรียบร้อยแล้ว${RESET}"
