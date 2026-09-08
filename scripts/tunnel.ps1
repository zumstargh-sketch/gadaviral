# GADAVIRAL — public tunnel for phone testing (no account needed)
# Creates a temporary public HTTPS URL that forwards to the local backend,
# so a real phone (on Wi-Fi or mobile data) can use the app immediately.
#
#   powershell -File scripts\tunnel.ps1
#
# NOTE: quick-tunnel URLs are EPHEMERAL — they change every run and expire
# when this script stops or the PC sleeps. For a permanent URL, deploy the
# backend to hosting (see docs/DEPLOY-NAMECHEAP.md) and rebuild the app with
#   gradlew -PAPI_BASE_URL=https://your-real-host assembleDebug

$root = Split-Path $PSScriptRoot -Parent
$cloudflared = Join-Path $PSScriptRoot 'cloudflared.exe'
if (-not (Test-Path $cloudflared)) {
  Write-Error 'scripts\cloudflared.exe not found. Download: https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-windows-amd64.exe'
  exit 1
}

# is the local backend running?
try { Invoke-WebRequest -UseBasicParsing http://localhost:4000/api/v1/health -TimeoutSec 5 | Out-Null }
catch { Write-Error 'Backend is not running on :4000. Start it first (backend: npm run dev, or scripts\dev.ps1).'; exit 1 }

$errLog = Join-Path $env:TEMP 'gadaviral-tunnel-err.txt'
$outLog = Join-Path $env:TEMP 'gadaviral-tunnel-out.txt'
Remove-Item $errLog, $outLog -ErrorAction SilentlyContinue

$proc = Start-Process -FilePath $cloudflared `
  -ArgumentList 'tunnel', '--url', 'http://localhost:4000' `
  -WindowStyle Hidden -PassThru `
  -RedirectStandardError $errLog -RedirectStandardOutput $outLog

Write-Host 'Opening tunnel… (Ctrl+C to stop it later)' -ForegroundColor Yellow
$url = $null
for ($i = 0; $i -lt 30 -and -not $url; $i++) {
  Start-Sleep 2
  if ($proc.HasExited) { Write-Error 'cloudflared exited unexpectedly:'; Get-Content $errLog -Tail 20; exit 1 }
  $url = (Select-String -Path $errLog -Pattern 'https://\S+\.trycloudflare\.com' |
          Select-Object -First 1).Matches.Value
}
if (-not $url) { Write-Error 'Tunnel URL not found:'; Get-Content $errLog -Tail 20; exit 1 }

Write-Host ""
Write-Host "  PUBLIC APP URL:  $url" -ForegroundColor Green
Write-Host ""
Write-Host '  - Open it in any browser (full website + app).'
Write-Host '  - Rebuild the phone APK against it:'
Write-Host "      cd android; gradlew.bat -PAPI_BASE_URL=$url assembleDebug" -ForegroundColor Cyan
Write-Host '  - The URL changes each run. Stop: Stop-Process -Id' $proc.Id
Write-Host '    Keep this window/process open while testing.'
try { Wait-Process -Id $proc.Id -ErrorAction SilentlyContinue } catch { }
