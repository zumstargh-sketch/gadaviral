<#
Run the GADAVIRAL WordPress migration helpers on a machine with WP-CLI / PHP available.

Usage examples:
  # Run media fetch/import (will create scripts/media_mappings.json)
  .\scripts\run_wp_migration.ps1 -WpPath "C:\inetpub\wwwroot\wordpress" -Step media

  # Run full importer (wp eval-file scripts/wp_importer_runner.php)
  .\scripts\run_wp_migration.ps1 -WpPath "C:\inetpub\wwwroot\wordpress" -Step importer

  # Dry-run: this script only executes commands; ensure you test on staging and backup DB first

Notes:
 - This script does NOT run against production. Run on a staging instance with a DB snapshot.
 - WP-CLI must be installed and available in PATH, or provide WP root in -WpPath.
 - The migration PHP scripts assume they are located in the project scripts/ directory and will write outputs there.
#>

param(
	[string]$WpPath = ".",
	[ValidateSet('media','importer')]
	[string]$Step = 'media'
)

function Fail($msg) { Write-Error $msg; exit 1 }

Write-Host "Running GADAVIRAL migration step='$Step' against WP path: $WpPath"

$wpCmd = $null
try { $wpCmd = (Get-Command wp -ErrorAction Stop).Source } catch { }
if (-not $wpCmd) {
	Write-Host "WP-CLI not found in PATH. Attempting to use php + wp-load.php to execute eval-file."
}

if ($wpCmd) {
	if ($Step -eq 'media') {
		Write-Host "Executing: wp --path=\"$WpPath\" eval-file scripts/media_migrate_helper.php"
		& $wpCmd --path="$WpPath" eval-file "scripts/media_migrate_helper.php"
		exit $LASTEXITCODE
	}
	if ($Step -eq 'importer') {
		Write-Host "Executing: wp --path=\"$WpPath\" eval-file scripts/wp_importer_runner.php"
		& $wpCmd --path="$WpPath" eval-file "scripts/wp_importer_runner.php"
		exit $LASTEXITCODE
	}
} else {
	# fallback to php - require WP root to locate wp-load.php
	$wpLoad = Join-Path $WpPath 'wp-load.php'
	if (-not (Test-Path $wpLoad)) { Fail "wp-load.php not found at $wpLoad. Install WP-CLI or provide correct WP path." }
	if ($Step -eq 'media') {
		Write-Host "Executing: php scripts/media_migrate_helper.php (with WP loaded)"
		php -f "scripts/media_migrate_helper.php" -- "--wp-path=$WpPath"
		exit $LASTEXITCODE
	}
	if ($Step -eq 'importer') {
		Write-Host "Executing: php scripts/wp_importer_runner.php (with WP loaded)"
		php -f "scripts/wp_importer_runner.php" -- "--wp-path=$WpPath"
		exit $LASTEXITCODE
	}
}
