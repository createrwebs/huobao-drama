#!/usr/bin/env bash
# ====================================================
# 🎬 Tora StoryVDO / Huobao Drama - One-Click Launcher
# ====================================================

set -e
cd "$(dirname "$0")"

# Ensure standard tool paths (Homebrew, etc.) are available
export PATH="/opt/homebrew/bin:/usr/local/bin:$PATH"

# Colors for terminal output
BOLD="\033[1m"
GREEN="\033[0;32m"
CYAN="\033[0;36m"
YELLOW="\033[1;33m"
RED="\033[0;31m"
RESET="\033[0m"

echo -e "${BOLD}${CYAN}"
echo "======================================================"
echo "  🚀 Tora StoryVDO / Huobao Drama - One-Click Launcher"
echo "======================================================"
echo -e "${RESET}"

# 1. Setup Node.js 22 (Required by native module better-sqlite3)
setup_node() {
  echo -e "${CYAN}🔍 [1/4] ตรวจสอบสภาพแวดล้อม Node.js...${RESET}"
  
  # Search in nvm directory for latest installed v22
  if [ -d "$HOME/.nvm/versions/node" ]; then
    local node22_path=$(ls -d "$HOME/.nvm/versions/node/v22"* 2>/dev/null | sort -V | tail -n 1)
    if [ -n "$node22_path" ] && [ -d "$node22_path/bin" ]; then
      export PATH="$node22_path/bin:$PATH"
    fi
  fi

  # Try loading nvm if current node is still not v22
  local cur_version=$(node -v 2>/dev/null || echo "")
  if [[ ! "$cur_version" =~ ^v22\. ]] && [ -s "$HOME/.nvm/nvm.sh" ]; then
    export NVM_DIR="$HOME/.nvm"
    # shellcheck source=/dev/null
    . "$NVM_DIR/nvm.sh"
    nvm use 22 >/dev/null 2>&1 || true
  fi

  # Fallback to Homebrew node@22 if present
  if [[ ! "$(node -v 2>/dev/null)" =~ ^v22\. ]] && [ -d "/opt/homebrew/opt/node@22/bin" ]; then
    export PATH="/opt/homebrew/opt/node@22/bin:$PATH"
  fi

  local final_version=$(node -v 2>/dev/null || echo "not found")
  if [[ "$final_version" =~ ^v22\. ]]; then
    echo -e "   ${GREEN}✅ Node.js: $final_version (เข้ากันได้กับ better-sqlite3)${RESET}"
  else
    echo -e "   ${YELLOW}⚠️  คำเตือน: กำลังใช้ Node.js $final_version (แนะนำ Node 22.x)${RESET}"
    echo -e "   หากพบข้อผิดพลาด NODE_MODULE_VERSION ให้รัน: nvm use 22"
  fi
}

# 2. Check and start CLIProxyAPI (Port 8317)
check_cliproxyapi() {
  echo -e "\n${CYAN}🤖 [2/4] ตรวจสอบระบบ AI Service (CLIProxyAPI พอร์ต 8317)...${RESET}"
  
  if curl -s -m 2 http://127.0.0.1:8317/v1/models >/dev/null 2>&1; then
    echo -e "   ${GREEN}✅ CLIProxyAPI ทำงานอยู่แล้วบนพอร์ต 8317${RESET}"
    return 0
  fi

  echo -e "   ${YELLOW}⏳ ไม่พบ service บนพอร์ต 8317 กำลังสั่งเริ่มงานผ่าน brew services...${RESET}"
  if command -v brew >/dev/null 2>&1; then
    brew services start cliproxyapi >/dev/null 2>&1 || true
    for i in {1..5}; do
      if curl -s -m 1 http://127.0.0.1:8317/v1/models >/dev/null 2>&1; then
        echo -e "   ${GREEN}✅ เริ่มต้น CLIProxyAPI สำเร็จ!${RESET}"
        return 0
      fi
      sleep 1
    done
  fi

  echo -e "   ${YELLOW}⚠️ ไม่สามารถยืนยัน CLIProxyAPI บนพอร์ต 8317 ได้ (จะดำเนินการต่อ)${RESET}"
}

# 3. Clean up conflicting ports (5679 for Backend, 3013 for Frontend)
free_ports() {
  echo -e "\n${CYAN}🧹 [3/4] ตรวจสอบพอร์ตเชื่อมต่อ (5679 และ 3013)...${RESET}"
  
  local backend_pids=$(lsof -ti :5679 2>/dev/null || true)
  if [ -n "$backend_pids" ]; then
    echo -e "   ${YELLOW}⚠️ พอร์ต 5679 (Backend) มีโปรเซสค้างอยู่ (PID: $backend_pids) เคลียร์พอร์ตให้อัตโนมัติ...${RESET}"
    kill -9 $backend_pids 2>/dev/null || true
    sleep 1
  else
    echo -e "   ${GREEN}✅ พอร์ต 5679 (Backend) ว่างพร้อมใช้งาน${RESET}"
  fi

  local frontend_pids=$(lsof -ti :3013 2>/dev/null || true)
  if [ -n "$frontend_pids" ]; then
    echo -e "   ${YELLOW}⚠️ พอร์ต 3013 (Frontend) มีโปรเซสค้างอยู่ (PID: $frontend_pids) เคลียร์พอร์ตให้อัตโนมัติ...${RESET}"
    kill -9 $frontend_pids 2>/dev/null || true
    sleep 1
  else
    echo -e "   ${GREEN}✅ พอร์ต 3013 (Frontend) ว่างพร้อมใช้งาน${RESET}"
  fi
}

# 4. Auto-open browser when ready
wait_and_open_browser() {
  (
    for i in {1..45}; do
      if curl -s -m 1 http://localhost:3013/storyvdo/ >/dev/null 2>&1; then
        echo -e "\n${BOLD}${GREEN}🎉 ระบบพร้อมใช้งานแล้ว! กำลังเปิดเว็บเบราว์เซอร์อัตโนมัติ...${RESET}\n"
        open "http://localhost:3013/storyvdo/drama/2/episode/2" 2>/dev/null || open "http://localhost:3013/storyvdo/" 2>/dev/null || true
        break
      fi
      sleep 1
    done
  ) &
  BROWSER_WATCHER_PID=$!
}

# Cleanup on exit
cleanup() {
  echo -e "\n\n${YELLOW}🛑 กำลังปิดระบบ Tora StoryVDO ทั้งหมด...${RESET}"
  if [ -n "$BROWSER_WATCHER_PID" ]; then
    kill "$BROWSER_WATCHER_PID" 2>/dev/null || true
  fi
  
  # Terminate processes on our ports
  local bpids=$(lsof -ti :5679 2>/dev/null || true)
  if [ -n "$bpids" ]; then
    kill -9 $bpids 2>/dev/null || true
  fi
  local fpids=$(lsof -ti :3013 2>/dev/null || true)
  if [ -n "$fpids" ]; then
    kill -9 $fpids 2>/dev/null || true
  fi
  echo -e "${GREEN}✅ ปิดการทำงานเรียบร้อย${RESET}"
  exit 0
}

trap cleanup INT TERM

# Run Setup
setup_node
check_cliproxyapi
free_ports

echo -e "\n${CYAN}🚀 [4/4] กำลังเริ่ม Backend และ Frontend...${RESET}"
echo -e "${BOLD}------------------------------------------------------${RESET}"
echo -e "🌐 Web UI:   ${CYAN}http://localhost:3013/storyvdo/${RESET}"
echo -e "⚙️  Backend:  ${CYAN}http://localhost:5679${RESET}"
echo -e "🤖 AI Proxy: ${CYAN}http://127.0.0.1:8317${RESET}"
echo -e "${BOLD}------------------------------------------------------${RESET}"
echo -e "${YELLOW}กด [Ctrl + C] หรือปิดหน้าต่างนี้เพื่อหยุดการทำงานทั้งหมด${RESET}\n"

wait_and_open_browser

# Start both servers via concurrently
./node_modules/.bin/concurrently \
  -n "BACKEND,FRONTEND" \
  -c "green,cyan" \
  --kill-others \
  "npm run dev:backend" \
  "npm run dev:frontend"
