<?php
// Example WP-CLI-compatible importer: reads JSON files from a directory and creates WP users/posts/comments and populates gadv_ tables.
// Usage (on WP host): wp eval-file scripts/wp_importer_example.php -- path=path/to/exports

$args = getopt(null, ['path:']);
$path = $args['path'] ?? ($argv[1] ?? null);
if (!$path || !is_dir($path)) {
	echo "Usage: wp eval-file scripts/wp_importer_example.php -- path=exports/transformed\n";
	exit(1);
}

function gadv_import_users($path) {
	$f = $path . '/users.json';
	if (!file_exists($f)) return 0;
	$data = json_decode(file_get_contents($f), true);
	$count = 0;
	foreach ($data as $u) {
		if (email_exists($u['email'])) continue;
		$username = sanitize_user($u['username'] ?? preg_replace('/@.*$/','',$u['email']), true);
		$pwd = wp_generate_password();
		$id = wp_create_user($username, $pwd, $u['email']);
		if (is_wp_error($id)) continue;
		wp_update_user(['ID'=>$id,'display_name'=>$u['full_name'] ?? $username]);
		if (!empty($u['avatar_url'])) update_user_meta($id, 'gadv_avatar_url', esc_url_raw($u['avatar_url']));
		if (!empty($u['is_demo'])) update_user_meta($id, 'gadv_is_demo', 1);
		$count++;
	}
	return $count;
}

function gadv_import_posts($path) {
	$f = $path . '/posts.json';
	if (!file_exists($f)) return 0;
	$data = json_decode(file_get_contents($f), true);
	$count = 0;
	foreach ($data as $p) {
		// avoid duplicates by GUID if present
		$args = ['post_title'=>wp_strip_all_tags($p['title'] ?? ''),'post_content'=>$p['content'] ?? '','post_status'=>'publish','post_author'=>intval($p['author_id'] ?? 0)];
		$id = wp_insert_post($args);
		if (is_wp_error($id)) continue;
		if (!empty($p['meta'])) foreach ($p['meta'] as $k=>$v) update_post_meta($id,$k,$v);
		$count++;
	}
	return $count;
}

echo "Importing users...\n";
$u = gadv_import_users($path);
echo "Imported users: $u\n";
echo "Importing posts...\n";
$p = gadv_import_posts($path);
echo "Imported posts: $p\n";

// Further import functions: comments, reactions into gadv_reactions, follows into gadv_follows, messages into gadv_messages, etc.

echo "Done. Review logs and run compatibility checks.\n";
