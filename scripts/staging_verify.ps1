<#
STAGING VERIFICATION SCRIPT (non-destructive)

This PowerShell helper automates staging-only verification steps that must be
run on a machine that has access to the staging WordPress instance and has
WP-CLI and PHP available. It does not perform any destructive actions and
only reads and verifies status and endpoints. Use the script from the
project root like:

  # Verify WP-CLI is available and plugin files are present
  .\scripts\staging_verify.ps1 -WpPath "C:\inetpub\wwwroot\staging_wp" -StagingUrl "https://staging.gadaviral.test"

Parameters:
  -WpPath: Path to the WordPress installation (wp-load.php present)
  -StagingUrl: Base URL for REST API (e.g. https://staging.gadaviral.test)

Notes:
 - This script does NOT modify production.
 - It uses WP-CLI where possible and falls back to HTTP checks.
 - It will NOT run the importer or media migrator automatically; it only
   verifies readiness. Use scripts/run_wp_migration.ps1 to run importer steps.
#>

param(
	[Parameter(Mandatory=$true)] [string]$WpPath,
	[Parameter(Mandatory=$true)] [string]$StagingUrl
)

function Fail($msg) { Write-Error $msg; exit 1 }

Write-Host "Staging verification starting for: $StagingUrl (WP Path: $WpPath)"

# Check WP-CLI
$wp = $null
try { $wp = (Get-Command wp -ErrorAction Stop).Source } catch { }
if ($wp) { Write-Host "WP-CLI found: $wp" } else { Write-Host "WP-CLI not found in PATH; some checks will be performed via HTTP only." }

# 1) Verify plugin file exists
$pluginFile = Join-Path $PSScriptRoot "..\wordpress\gadaviral-api\gadaviral-api.php"
if (-not (Test-Path $pluginFile)) { Fail "Plugin file not found at $pluginFile" }
Write-Host "Plugin file present: $pluginFile"

# 2) If WP-CLI available, try plugin activate (non-destructive): show status only
if ($wp) {
	Write-Host "Plugin status (wp plugin list | grep gadaviral-api):"
	& $wp --path="$WpPath" plugin list --status=active | Select-String "gadaviral-api" -Quiet
	if ($LASTEXITCODE -ne 0) { Write-Host "Plugin not active. To activate: wp --path=\"$WpPath\" plugin activate gadaviral-api" }
	else { Write-Host "Plugin appears ACTIVE." }
	# Show DB tables created by plugin (look for gadv_ tables)
	Write-Host "Listing gadv_ tables (SHOW TABLES LIKE '%gadv_%')"
	& $wp --path="$WpPath" db query "SHOW TABLES LIKE '%gadv_%'" | Out-String | Write-Host
}

# 3) Verify health endpoint
try {
	$health = Invoke-RestMethod -Uri "$StagingUrl/wp-json/gadaviral/v1/health" -Method GET -TimeoutSec 30
	Write-Host "Health endpoint response:"; $health | ConvertTo-Json -Depth 3 | Write-Host
} catch {
	Write-Warning "Health endpoint check failed: $_"
}

# 4) Verify PHP syntax for plugin file (if php available)
try {
	$php = (Get-Command php -ErrorAction Stop).Source
	Write-Host "PHP found: $php - running syntax check on plugin"
	& php -l "$pluginFile" | Write-Host
} catch { Write-Host "PHP CLI not available — skip php -l" }

# 5) Check core API endpoints (public)
$checks = @(
	"/wp-json/gadaviral/v1/health",
	"/wp-json/gadaviral/v1/posts?limit=3",
	"/wp-json/gadaviral/v1/community/highlights",
	"/wp-json/gadaviral/v1/search?q=test"
)
foreach ($c in $checks) {
	$url = $StagingUrl + $c
	try {
		$r = Invoke-RestMethod -Uri $url -Method GET -TimeoutSec 20
		Write-Host "OK: $c -> HTTP 200"
	} catch { Write-Warning "WARN: $c -> $($_.Exception.Message)" }
}

Write-Host "Staging verification script finished. Review output above. To run importer/media migrate, use scripts/run_wp_migration.ps1 on a machine with WP-CLI and the staging WP available."
