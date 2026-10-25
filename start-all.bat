@echo off
title Huobao Drama - All Services (Backend, Frontend, Flow Bridge)
cd /d "%~dp0"

echo ===================================================
echo   Starting Huobao Drama Services...
echo   - Backend:     http://localhost:5679
echo   - Frontend:    http://localhost:3013/settings
echo   - Flow Bridge: ws://127.0.0.1:9222
echo ===================================================
echo.

node .\node_modules\concurrently\dist\bin\index.js -n "backend,frontend,bridge" -c "green,cyan,yellow" "npm.cmd run dev:backend" "npm.cmd run dev:frontend" "npm.cmd run dev:bridge"
pause

