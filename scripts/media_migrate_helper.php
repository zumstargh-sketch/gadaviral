<?php
/**
 * Media migrate helper (CLI/WP-CLI)
 * Usage: php scripts/media_migrate_helper.php --source exports
 * The script reads posts.json/post_media.json and attempts to download original files
 * and insert them into WP media library, updating mapping file scripts/media_mappings.json
 * Format written: { "original_url": { "attachment_id": 123, "new_url": "..." }, ... }
 */

if (php_sapi_name() === 'cli') {
	$argv = $_SERVER['argv'];
	$source = 'exports';
	foreach ($argv as $i => $a) if ($a === '--source' && isset($argv[$i+1])) $source = $argv[$i+1];
} else {
	if (!isset($_GET['source'])) die('source required');
	$source = $_GET['source'];
}
$dir = __DIR__ . '/' . $source;
if (!is_dir($dir)) die("Source dir not found: $dir\n");

function read_json($file) { return json_decode(file_get_contents($file), true); }

$mediaMappings = [];
$mappingsFile = __DIR__ . '/media_mappings.json';
if (file_exists($mappingsFile)) $mediaMappings = read_json($mappingsFile);

// Read post_media.json if exists
$pmFile = $dir . '/post_media.json';
if (!file_exists($pmFile)) {
	echo "No post_media.json found in exports; nothing to migrate.\n";
	exit(0);
}
$postMedia = read_json($pmFile);

require_once(dirname(__DIR__) . '/wordpress/wp-load.php'); // load WP when running within project
require_once(ABSPATH . 'wp-admin/includes/file.php');
require_once(ABSPATH . 'wp-admin/includes/media.php');
require_once(ABSPATH . 'wp-admin/includes/image.php');

foreach ($postMedia as $pm) {
	$orig = $pm['url'] ?? null;
	if (!$orig) { continue; }
	if (isset($mediaMappings[$orig])) { continue; }
	// Attempt to download file to temp
	$tmp = wp_tempnam($orig);
	$resp = wp_remote_get($orig, ['timeout'=>20]);
	if (is_wp_error($resp) || wp_remote_retrieve_response_code($resp) !== 200) {
		$mediaMappings[$orig] = ['error' => 'fetch_failed'];
		continue;
	}
	$body = wp_remote_retrieve_body($resp);
	file_put_contents($tmp, $body);
	$filetype = wp_check_filetype(basename($orig), null);
	$upload = wp_upload_bits(basename($orig), null, $body);
	if ($upload['error']) { $mediaMappings[$orig] = ['error' => $upload['error']]; unlink($tmp); continue; }
	$attachment = [
		'post_mime_type' => $filetype['type'] ?? $upload['type'],
		'post_title' => sanitize_file_name(basename($orig)),
		'post_content' => '',
		'post_status' => 'inherit'
	];
	$attach_id = wp_insert_attachment($attachment, $upload['file']);
	$attach_data = wp_generate_attachment_metadata($attach_id, $upload['file']);
	wp_update_attachment_metadata($attach_id, $attach_data);
	$mediaMappings[$orig] = ['attachment_id' => $attach_id, 'new_url' => wp_get_attachment_url($attach_id)];
}

file_put_contents($mappingsFile, json_encode($mediaMappings, JSON_PRETTY_PRINT));
if (php_sapi_name() === 'cli') echo "Media mappings written to scripts/media_mappings.json\n";
else echo json_encode($mediaMappings);

?>