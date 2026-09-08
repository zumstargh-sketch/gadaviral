# GADAVIRAL development launcher (Windows)
# Starts embedded PostgreSQL, the API and the website together.
$root = Split-Path $PSScriptRoot -Parent

Write-Host "GADAVIRAL dev stack" -ForegroundColor Yellow

# 1. embedded database (kept running in its own window)
Start-Process powershell -ArgumentList "-NoExit", "-Command", "Set-Location '$root\backend'; npm run dev:db"

Start-Sleep -Seconds 12   # let PostgreSQL accept connections first

# 2. API
Start-Process powershell -ArgumentList "-NoExit", "-Command", "Set-Location '$root\backend'; npm run dev"

# 3. website
Start-Process powershell -ArgumentList "-NoExit", "-Command", "Set-Location '$root\web'; npm run dev"

Write-Host ""
Write-Host "API:  http://localhost:4000/api/docs" -ForegroundColor Green
Write-Host "Web:  http://localhost:5173" -ForegroundColor Green
Write-Host "Demo: cd backend; npm run seed:demo; npm run demo:verify" -ForegroundColor Green
