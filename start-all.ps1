# Huobao Drama - Run All Services (Backend, Frontend, Flow Bridge)
$root = $PSScriptRoot
if (-not $root) { $root = Get-Location }
Set-Location $root

Write-Host "===================================================" -ForegroundColor Cyan
Write-Host "  Starting Huobao Drama Services..." -ForegroundColor Green
Write-Host "  - Backend:     http://localhost:5679" -ForegroundColor Green
Write-Host "  - Frontend:    http://localhost:3013/settings" -ForegroundColor Cyan
Write-Host "  - Flow Bridge: ws://127.0.0.1:9222" -ForegroundColor Yellow
Write-Host "===================================================" -ForegroundColor Cyan
Write-Host ""

& node "$root\node_modules\concurrently\dist\bin\index.js" -n "backend,frontend,bridge" -c "green,cyan,yellow" "npm.cmd run dev:backend" "npm.cmd run dev:frontend" "npm.cmd run dev:bridge"

