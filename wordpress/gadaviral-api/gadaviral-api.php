<?php
/**
 * Plugin Name: GADAVIRAL API
 * Description: WordPress-backed REST API endpoints for the GADAVIRAL frontend. Non-destructive; uses WP users, posts and custom tables for reactions/follows/notifications.
 * Version: 0.1.0
 * Author: GADAVIRAL
 * Text Domain: gadaviral-api
 */

if (!defined('ABSPATH')) {
	exit;
}

// --- Additional activation tables for messaging, groups, polls, reports ---
register_activation_hook(__FILE__, 'gadv_create_additional_tables');
function gadv_create_additional_tables() {
	global $wpdb;
	$charset_collate = $wpdb->get_charset_collate();
	$prefix = $wpdb->prefix;
	$sqls = [];
	$sqls[] = "CREATE TABLE IF NOT EXISTS {$prefix}gadv_conversations (
		id bigint(20) unsigned NOT NULL AUTO_INCREMENT,
		is_group tinyint(1) NOT NULL DEFAULT 0,
		title varchar(255) DEFAULT NULL,
		created_by bigint(20) unsigned DEFAULT NULL,
		last_message_at datetime DEFAULT NULL,
		created_at datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
		PRIMARY KEY (id)
	) $charset_collate";

	$sqls[] = "CREATE TABLE IF NOT EXISTS {$prefix}gadv_conversation_participants (
		conversation_id bigint(20) unsigned NOT NULL,
		user_id bigint(20) unsigned NOT NULL,
		last_read_at datetime DEFAULT NULL,
		joined_at datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
		PRIMARY KEY (conversation_id, user_id)
	) $charset_collate";

	$sqls[] = "CREATE TABLE IF NOT EXISTS {$prefix}gadv_messages (
		id bigint(20) unsigned NOT NULL AUTO_INCREMENT,
		conversation_id bigint(20) unsigned NOT NULL,
		sender_id bigint(20) unsigned NOT NULL,
		content text,
		media_url text,
		status varchar(32) DEFAULT 'SENT',
		created_at datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
		PRIMARY KEY (id)
	) $charset_collate";

	$sqls[] = "CREATE TABLE IF NOT EXISTS {$prefix}gadv_groups (
		id bigint(20) unsigned NOT NULL AUTO_INCREMENT,
		slug varchar(191) NOT NULL,
		name varchar(255) NOT NULL,
		description text,
		cover_url text,
		avatar_url text,
		privacy varchar(32) DEFAULT 'PUBLIC',
		creator_id bigint(20) unsigned DEFAULT NULL,
		member_count int DEFAULT 0,
		created_at datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
		PRIMARY KEY (id),
		UNIQUE KEY slug (slug)
	) $charset_collate";

	$sqls[] = "CREATE TABLE IF NOT EXISTS {$prefix}gadv_group_members (
		group_id bigint(20) unsigned NOT NULL,
		user_id bigint(20) unsigned NOT NULL,
		role varchar(32) DEFAULT 'MEMBER',
		status varchar(32) DEFAULT 'ACTIVE',
		joined_at datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
		PRIMARY KEY (group_id, user_id)
	) $charset_collate";

	$sqls[] = "CREATE TABLE IF NOT EXISTS {$prefix}gadv_polls (
		id bigint(20) unsigned NOT NULL AUTO_INCREMENT,
		post_id bigint(20) unsigned DEFAULT NULL,
		question text,
		created_at datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
		PRIMARY KEY (id)
	) $charset_collate";

	$sqls[] = "CREATE TABLE IF NOT EXISTS {$prefix}gadv_poll_options (
		id bigint(20) unsigned NOT NULL AUTO_INCREMENT,
		poll_id bigint(20) unsigned NOT NULL,
		label varchar(255) NOT NULL,
		votes int NOT NULL DEFAULT 0,
		PRIMARY KEY (id)
	) $charset_collate";

	$sqls[] = "CREATE TABLE IF NOT EXISTS {$prefix}gadv_poll_votes (
		poll_id bigint(20) unsigned NOT NULL,
		option_id bigint(20) unsigned NOT NULL,
		user_id bigint(20) unsigned NOT NULL,
		created_at datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
		PRIMARY KEY (poll_id, option_id, user_id)
	) $charset_collate";

	$sqls[] = "CREATE TABLE IF NOT EXISTS {$prefix}gadv_reports (
		id bigint(20) unsigned NOT NULL AUTO_INCREMENT,
		reporter_id bigint(20) unsigned NOT NULL,
		entity_type varchar(32) NOT NULL,
		entity_id bigint(20) NOT NULL,
		reason varchar(255),
		details text,
		status varchar(32) DEFAULT 'OPEN',
		created_at datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
		PRIMARY KEY (id)
	) $charset_collate";

	require_once(ABSPATH . 'wp-admin/includes/upgrade.php');
	foreach ($sqls as $sql) dbDelta($sql);
}

// --- Comments endpoints ---
add_action('rest_api_init', function() {
	register_rest_route('gad/v1', '/posts/(?P<id>[^/]+)/comments', [
		'methods' => 'GET',
		'callback' => 'gadv_comments_list',
		'permission_callback' => '__return_true',
	]);
	register_rest_route('gad/v1', '/posts/(?P<id>[^/]+)/comments', [
		'methods' => 'POST',
		'callback' => 'gadv_comments_create',
		'permission_callback' => 'gadv_require_jwt',
	]);
});

function gadv_comments_list($request) {
	$post_id = intval($request->get_param('id'));
	$comments = get_comments(['post_id' => $post_id, 'status' => 'approve']);
	$out = [];
	foreach ($comments as $c) {
		$out[] = [
			'id' => $c->comment_ID,
			'author_id' => $c->user_id,
			'content' => $c->comment_content,
			'created_at' => $c->comment_date_gmt,
			'parent_comment_id' => $c->comment_parent ?: null,
		];
	}
	return rest_ensure_response(['items' => $out, 'total' => count($out)]);
}

function gadv_comments_create($request) {
	$post_id = intval($request->get_param('id'));
	$body = json_decode($request->get_body(), true);
	$user = gadv_get_request_user($request);
	if (!$user) return new WP_Error('unauthorized', 'Authentication required', ['status' => 401]);
	$content = isset($body['content']) ? wp_kses_post($body['content']) : '';
	if (empty($content)) return new WP_Error('invalid', 'Content required', ['status' => 400]);
	$commentdata = [
		'comment_post_ID' => $post_id,
		'comment_content' => $content,
		'user_id' => $user->ID,
		'comment_parent' => isset($body['parent_comment_id']) ? intval($body['parent_comment_id']) : 0,
		'comment_approved' => 1,
	];
	$cid = wp_insert_comment($commentdata);
	if (!$cid) return new WP_Error('failed', 'Could not create comment', ['status' => 500]);
	return rest_ensure_response(['id' => $cid]);
}

// --- Follow endpoints ---
add_action('rest_api_init', function() {
	register_rest_route('gad/v1', '/users/(?P<id>[^/]+)/follow', [
		'methods' => 'POST',
		'callback' => 'gadv_follow_user',
		'permission_callback' => 'gadv_require_jwt',
	]);
	register_rest_route('gad/v1', '/users/(?P<id>[^/]+)/unfollow', [
		'methods' => 'POST',
		'callback' => 'gadv_unfollow_user',
		'permission_callback' => 'gadv_require_jwt',
	]);
});

function gadv_follow_user($request) {
	global $wpdb;
	$target = intval($request->get_param('id'));
	$user = gadv_get_request_user($request);
	if (!$user) return new WP_Error('unauthorized', 'Authentication required', ['status' => 401]);
	if ($user->ID === $target) return new WP_Error('invalid', 'Cannot follow yourself', ['status' => 400]);
	$table = $wpdb->prefix . 'gadv_follows';
	$exists = $wpdb->get_row($wpdb->prepare("SELECT 1 FROM $table WHERE follower_id=%d AND followee_id=%d", $user->ID, $target));
	if (!$exists) $wpdb->insert($table, ['follower_id' => $user->ID, 'followee_id' => $target]);
	return rest_ensure_response(['ok' => true]);
}

function gadv_unfollow_user($request) {
	global $wpdb;
	$target = intval($request->get_param('id'));
	$user = gadv_get_request_user($request);
	if (!$user) return new WP_Error('unauthorized', 'Authentication required', ['status' => 401]);
	$table = $wpdb->prefix . 'gadv_follows';
	$wpdb->delete($table, ['follower_id' => $user->ID, 'followee_id' => $target]);
	return rest_ensure_response(['ok' => true]);
}

// --- Notifications endpoints ---
add_action('rest_api_init', function() {
	register_rest_route('gad/v1', '/notifications', [
		'methods' => 'GET',
		'callback' => 'gadv_notifications_list',
		'permission_callback' => 'gadv_require_jwt',
	]);
	register_rest_route('gad/v1', '/notifications/mark-read', [
		'methods' => 'POST',
		'callback' => 'gadv_notifications_mark_read',
		'permission_callback' => 'gadv_require_jwt',
	]);
});

function gadv_notifications_list($request) {
	global $wpdb;
	$user = gadv_get_request_user($request);
	if (!$user) return new WP_Error('unauthorized', 'Authentication required', ['status' => 401]);
	$table = $wpdb->prefix . 'gadv_notifications';
	$rows = $wpdb->get_results($wpdb->prepare("SELECT * FROM $table WHERE user_id=%d ORDER BY created_at DESC LIMIT 100", $user->ID));
	return rest_ensure_response(['items' => $rows]);
}

function gadv_notifications_mark_read($request) {
	global $wpdb;
	$user = gadv_get_request_user($request);
	if (!$user) return new WP_Error('unauthorized', 'Authentication required', ['status' => 401]);
	$body = json_decode($request->get_body(), true);
	$ids = isset($body['ids']) && is_array($body['ids']) ? array_map('intval', $body['ids']) : [];
	if (empty($ids)) return new WP_Error('invalid', 'No ids provided', ['status' => 400]);
	$in = implode(',', array_fill(0, count($ids), '%d'));
	$query = $wpdb->prepare("UPDATE {$wpdb->prefix}gadv_notifications SET read_at = NOW() WHERE user_id = %d AND id IN ($in)", array_merge([$user->ID], $ids));
	$wpdb->query($query);
	return rest_ensure_response(['ok' => true]);
}

// --- Messaging endpoints (conversations/messages) ---
add_action('rest_api_init', function() {
	register_rest_route('gad/v1', '/conversations', [
		'methods' => 'GET',
		'callback' => 'gadv_conversations_list',
		'permission_callback' => 'gadv_require_jwt',
	]);
	register_rest_route('gad/v1', '/conversations', [
		'methods' => 'POST',
		'callback' => 'gadv_conversation_create',
		'permission_callback' => 'gadv_require_jwt',
	]);
	register_rest_route('gad/v1', '/conversations/(?P<id>\d+)/messages', [
		'methods' => 'GET',
		'callback' => 'gadv_messages_list',
		'permission_callback' => 'gadv_require_jwt',
	]);
	register_rest_route('gad/v1', '/conversations/(?P<id>\d+)/messages', [
		'methods' => 'POST',
		'callback' => 'gadv_message_send',
		'permission_callback' => 'gadv_require_jwt',
	]);
});

function gadv_conversations_list($request) {
	global $wpdb;
	$user = gadv_get_request_user($request);
	if (!$user) return new WP_Error('unauthorized', 'Authentication required', ['status' => 401]);
	$table = $wpdb->prefix . 'gadv_conversation_participants';
	$rows = $wpdb->get_results($wpdb->prepare("SELECT conversation_id FROM $table WHERE user_id=%d", $user->ID));
	$out = [];
	foreach ($rows as $r) {
		$conv = $wpdb->get_row($wpdb->prepare("SELECT * FROM {$wpdb->prefix}gadv_conversations WHERE id=%d", $r->conversation_id));
		if ($conv) $out[] = $conv;
	}
	return rest_ensure_response(['items' => $out]);
}

function gadv_conversation_create($request) {
	global $wpdb;
	$body = json_decode($request->get_body(), true);
	$user = gadv_get_request_user($request);
	if (!$user) return new WP_Error('unauthorized', 'Authentication required', ['status' => 401]);
	$is_group = !empty($body['is_group']) ? 1 : 0;
	$title = isset($body['title']) ? sanitize_text_field($body['title']) : null;
	$wpdb->insert($wpdb->prefix . 'gadv_conversations', ['is_group' => $is_group, 'title' => $title, 'created_by' => $user->ID]);
	$cid = $wpdb->insert_id;
	// participants
	$participants = isset($body['participants']) && is_array($body['participants']) ? $body['participants'] : [];
	$wpdb->insert($wpdb->prefix . 'gadv_conversation_participants', ['conversation_id' => $cid, 'user_id' => $user->ID]);
	foreach ($participants as $p) {
		$p = intval($p);
		if ($p && $p !== $user->ID) $wpdb->insert($wpdb->prefix . 'gadv_conversation_participants', ['conversation_id' => $cid, 'user_id' => $p]);
	}
	return rest_ensure_response(['id' => $cid]);
}

function gadv_messages_list($request) {
	global $wpdb;
	$cid = intval($request->get_param('id'));
	$user = gadv_get_request_user($request);
	if (!$user) return new WP_Error('unauthorized', 'Authentication required', ['status' => 401]);
	// Ensure participant
	$part = $wpdb->get_row($wpdb->prepare("SELECT * FROM {$wpdb->prefix}gadv_conversation_participants WHERE conversation_id=%d AND user_id=%d", $cid, $user->ID));
	if (!$part) return new WP_Error('forbidden', 'Not a participant', ['status' => 403]);
	$rows = $wpdb->get_results($wpdb->prepare("SELECT * FROM {$wpdb->prefix}gadv_messages WHERE conversation_id=%d ORDER BY created_at ASC", $cid));
	return rest_ensure_response(['items' => $rows]);
}

function gadv_message_send($request) {
	global $wpdb;
	$cid = intval($request->get_param('id'));
	$body = json_decode($request->get_body(), true);
	$user = gadv_get_request_user($request);
	if (!$user) return new WP_Error('unauthorized', 'Authentication required', ['status' => 401]);
	$content = isset($body['content']) ? wp_kses_post($body['content']) : '';
	$media = isset($body['media_url']) ? esc_url_raw($body['media_url']) : null;
	$wpdb->insert($wpdb->prefix . 'gadv_messages', ['conversation_id' => $cid, 'sender_id' => $user->ID, 'content' => $content, 'media_url' => $media]);
	$mid = $wpdb->insert_id;
	$wpdb->update($wpdb->prefix . 'gadv_conversations', ['last_message_at' => current_time('mysql', 1)], ['id' => $cid]);
	return rest_ensure_response(['id' => $mid]);
}

// --- Groups endpoints (basic) ---
add_action('rest_api_init', function() {
	register_rest_route('gad/v1', '/groups', [
		'methods' => 'GET',
		'callback' => 'gadv_groups_list',
		'permission_callback' => '__return_true',
	]);
	register_rest_route('gad/v1', '/groups', [
		'methods' => 'POST',
		'callback' => 'gadv_groups_create',
		'permission_callback' => 'gadv_require_jwt',
	]);
	register_rest_route('gad/v1', '/groups/(?P<slug>[^/]+)', [
		'methods' => 'GET',
		'callback' => 'gadv_group_get',
		'permission_callback' => '__return_true',
	]);
	register_rest_route('gad/v1', '/groups/(?P<slug>[^/]+)/join', [
		'methods' => 'POST',
		'callback' => 'gadv_group_join',
		'permission_callback' => 'gadv_require_jwt',
	]);
});

function gadv_groups_list($request) {
	global $wpdb;
	$rows = $wpdb->get_results("SELECT * FROM {$wpdb->prefix}gadv_groups ORDER BY created_at DESC LIMIT 100");
	return rest_ensure_response(['items' => $rows]);
}

function gadv_groups_create($request) {
	global $wpdb;
	$body = json_decode($request->get_body(), true);
	$user = gadv_get_request_user($request);
	if (!$user) return new WP_Error('unauthorized', 'Authentication required', ['status' => 401]);
	$slug = isset($body['slug']) ? sanitize_title($body['slug']) : sanitize_title($body['name'] ?? uniqid('g'));
	$name = isset($body['name']) ? sanitize_text_field($body['name']) : 'Group';
	$desc = isset($body['description']) ? wp_kses_post($body['description']) : '';
	$wpdb->insert($wpdb->prefix . 'gadv_groups', ['slug' => $slug, 'name' => $name, 'description' => $desc, 'creator_id' => $user->ID]);
	$gid = $wpdb->insert_id;
	$wpdb->insert($wpdb->prefix . 'gadv_group_members', ['group_id' => $gid, 'user_id' => $user->ID, 'role' => 'OWNER']);
	return rest_ensure_response(['id' => $gid, 'slug' => $slug]);
}

function gadv_group_get($request) {
	global $wpdb;
	$slug = sanitize_text_field($request->get_param('slug'));
	$row = $wpdb->get_row($wpdb->prepare("SELECT * FROM {$wpdb->prefix}gadv_groups WHERE slug=%s", $slug));
	if (!$row) return new WP_Error('not_found', 'Group not found', ['status' => 404]);
	return rest_ensure_response($row);
}

function gadv_group_join($request) {
	global $wpdb;
	$slug = sanitize_text_field($request->get_param('slug'));
	$user = gadv_get_request_user($request);
	if (!$user) return new WP_Error('unauthorized', 'Authentication required', ['status' => 401]);
	$g = $wpdb->get_row($wpdb->prepare("SELECT * FROM {$wpdb->prefix}gadv_groups WHERE slug=%s", $slug));
	if (!$g) return new WP_Error('not_found', 'Group not found', ['status' => 404]);
	$exists = $wpdb->get_row($wpdb->prepare("SELECT * FROM {$wpdb->prefix}gadv_group_members WHERE group_id=%d AND user_id=%d", $g->id, $user->ID));
	if (!$exists) $wpdb->insert($wpdb->prefix . 'gadv_group_members', ['group_id' => $g->id, 'user_id' => $user->ID]);
	return rest_ensure_response(['ok' => true]);
}

// --- Polls endpoints (basic) ---
add_action('rest_api_init', function() {
	register_rest_route('gad/v1', '/polls/(?P<poll>\d+)/vote', [
		'methods' => 'POST',
		'callback' => 'gadv_poll_vote',
		'permission_callback' => 'gadv_require_jwt',
	]);
	register_rest_route('gad/v1', '/polls/(?P<poll>\d+)', [
		'methods' => 'GET',
		'callback' => 'gadv_poll_get',
		'permission_callback' => '__return_true',
	]);
});

function gadv_poll_vote($request) {
	global $wpdb;
	$poll = intval($request->get_param('poll'));
	$body = json_decode($request->get_body(), true);
	$option = isset($body['option_id']) ? intval($body['option_id']) : 0;
	$user = gadv_get_request_user($request);
	if (!$user) return new WP_Error('unauthorized', 'Authentication required', ['status' => 401]);
	if (!$option) return new WP_Error('invalid', 'Option required', ['status' => 400]);
	$table_votes = $wpdb->prefix . 'gadv_poll_votes';
	$wpdb->replace($table_votes, ['poll_id' => $poll, 'option_id' => $option, 'user_id' => $user->ID]);
	// update counts
	$count = $wpdb->get_var($wpdb->prepare("SELECT COUNT(*) FROM {$wpdb->prefix}gadv_poll_votes WHERE poll_id=%d AND option_id=%d", $poll, $option));
	$wpdb->update($wpdb->prefix . 'gadv_poll_options', ['votes' => $count], ['id' => $option]);
	return rest_ensure_response(['ok' => true, 'option_votes' => intval($count)]);
}

function gadv_poll_get($request) {
	global $wpdb;
	$poll = intval($request->get_param('poll'));
	$poll_row = $wpdb->get_row($wpdb->prepare("SELECT * FROM {$wpdb->prefix}gadv_polls WHERE id=%d", $poll));
	if (!$poll_row) return new WP_Error('not_found', 'Poll not found', ['status' => 404]);
	$options = $wpdb->get_results($wpdb->prepare("SELECT * FROM {$wpdb->prefix}gadv_poll_options WHERE poll_id=%d", $poll));
	return rest_ensure_response(['poll' => $poll_row, 'options' => $options]);
}

// --- Search endpoint (basic) ---
add_action('rest_api_init', function() {
	register_rest_route('gad/v1', '/search', [
		'methods' => 'GET',
		'callback' => 'gadv_search',
		'permission_callback' => '__return_true',
	]);
});

function gadv_search($request) {
	$q = sanitize_text_field($request->get_param('q') ?? '');
	if ($q === '') return rest_ensure_response(['items' => []]);
	$users = get_users(['search' => "*{$q}*", 'search_columns' => ['user_login', 'display_name', 'user_email'], 'number' => 10]);
	$posts = get_posts(['s' => $q, 'posts_per_page' => 10]);
	$uout = array_map('gadv_user_public', $users);
	$pout = array_map(function($p){ return ['id'=>$p->ID,'title'=>$p->post_title,'excerpt'=>wp_trim_words($p->post_content,20)];}, $posts);
	return rest_ensure_response(['users' => $uout, 'posts' => $pout]);
}


global $gadv_db_version;
$gadv_db_version = '0.1';

register_activation_hook(__FILE__, 'gadv_activate');
function gadv_activate() {
	global $wpdb, $gadv_db_version;
	$charset_collate = $wpdb->get_charset_collate();
	$prefix = $wpdb->prefix;

	$tables = [];
	$tables[] = "CREATE TABLE IF NOT EXISTS {$prefix}gadv_reactions (
		id bigint(20) unsigned NOT NULL AUTO_INCREMENT,
		post_id bigint(20) unsigned NOT NULL,
		user_id bigint(20) unsigned NOT NULL,
		type varchar(32) NOT NULL DEFAULT 'LIKE',
		created_at datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
		PRIMARY KEY (id),
		UNIQUE KEY post_user (post_id,user_id)
	) $charset_collate";

	$tables[] = "CREATE TABLE IF NOT EXISTS {$prefix}gadv_follows (
		follower_id bigint(20) unsigned NOT NULL,
		followee_id bigint(20) unsigned NOT NULL,
		created_at datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
		PRIMARY KEY (follower_id, followee_id)
	) $charset_collate";

	$tables[] = "CREATE TABLE IF NOT EXISTS {$prefix}gadv_notifications (
		id bigint(20) unsigned NOT NULL AUTO_INCREMENT,
		user_id bigint(20) unsigned NOT NULL,
		actor_id bigint(20) unsigned DEFAULT NULL,
		type varchar(64) DEFAULT NULL,
		entity_id bigint(20) DEFAULT NULL,
		body text,
		read_at datetime DEFAULT NULL,
		created_at datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
		PRIMARY KEY (id)
	) $charset_collate";

	require_once(ABSPATH . 'wp-admin/includes/upgrade.php');
	foreach ($tables as $sql) {
		dbDelta($sql);
	}

	add_option('gadv_db_version', $gadv_db_version);
}

// Basic JWT helpers (HS256). Configure secret in WP option 'gadv_jwt_secret'.
function gadv_jwt_secret() {
	$s = get_option('gadv_jwt_secret');
	if (!$s) return 'change_this_secret';
	return $s;
}

function gadv_jwt_encode($payload, $exp_seconds = 900) {
	$header = ['alg' => 'HS256', 'typ' => 'JWT'];
	$payload['iat'] = time();
	$payload['exp'] = time() + $exp_seconds;
	$segments = [];
	$segments[] = rtrim(strtr(base64_encode(json_encode($header)), '+/', '-_'), '=');
	$segments[] = rtrim(strtr(base64_encode(json_encode($payload)), '+/', '-_'), '=');
	$signing_input = implode('.', $segments);
	$sig = hash_hmac('sha256', $signing_input, gadv_jwt_secret(), true);
	$segments[] = rtrim(strtr(base64_encode($sig), '+/', '-_'), '=');
	return implode('.', $segments);
}

function gadv_jwt_verify($token) {
	$parts = explode('.', $token);
	if (count($parts) != 3) return false;
	list($h64, $p64, $s64) = $parts;
	$signing_input = $h64 . '.' . $p64;
	$sig = base64_decode(strtr($s64, '-_', '+/'));
	$expected = hash_hmac('sha256', $signing_input, gadv_jwt_secret(), true);
	if (!hash_equals($expected, $sig)) return false;
	$payload = json_decode(base64_decode(strtr($p64, '-_', '+/')), true);
	if (!$payload) return false;
	if (isset($payload['exp']) && time() > $payload['exp']) return false;
	return $payload;
}

// Register REST routes
add_action('rest_api_init', function () {
	register_rest_route('gad/v1', '/health', [
		'methods' => 'GET',
		'callback' => 'gadv_health',
		'permission_callback' => '__return_true',
	]);

	register_rest_route('gad/v1', '/auth/login', [
		'methods' => 'POST',
		'callback' => 'gadv_auth_login',
		'permission_callback' => '__return_true',
	]);

	register_rest_route('gad/v1', '/auth/register', [
		'methods' => 'POST',
		'callback' => 'gadv_auth_register',
		'permission_callback' => '__return_true',
	]);

	register_rest_route('gad/v1', '/auth/refresh', [
		'methods' => 'POST',
		'callback' => 'gadv_auth_refresh',
		'permission_callback' => '__return_true',
	]);

	register_rest_route('gad/v1', '/community/highlights', [
		'methods' => 'GET',
		'callback' => 'gadv_community_highlights',
		'permission_callback' => '__return_true',
	]);

	register_rest_route('gad/v1', '/users/(?P<username>[a-zA-Z0-9_\-]+)', [
		'methods' => 'GET',
		'callback' => 'gadv_user_by_username',
		'permission_callback' => '__return_true',
	]);

	register_rest_route('gad/v1', '/posts', [
		'methods' => 'GET',
		'callback' => 'gadv_posts_feed',
		'permission_callback' => '__return_true',
	]);

	register_rest_route('gad/v1', '/posts', [
		'methods' => 'POST',
		'callback' => 'gadv_posts_create',
		'permission_callback' => 'gadv_require_jwt',
	]);

	register_rest_route('gad/v1', '/posts/(?P<id>[^/]+)/reactions', [
		'methods' => 'POST',
		'callback' => 'gadv_post_react',
		'permission_callback' => 'gadv_require_jwt',
	]);
});

function gadv_health($request) {
	return rest_ensure_response(['ok' => true, 'source' => 'wordpress-gadaviral-api']);
}

function gadv_auth_login($request) {
	$body = json_decode($request->get_body(), true);
	$username = isset($body['email']) ? $body['email'] : '';
	$password = isset($body['password']) ? $body['password'] : '';
	if (empty($username) || empty($password)) {
		return new WP_Error('invalid', 'Missing credentials', ['status' => 400]);
	}
	$creds = ['user_login' => $username, 'user_password' => $password, 'remember' => true];
	$user = wp_signon($creds, false);
	if (is_wp_error($user)) {
		return new WP_Error('auth_failed', $user->get_error_message(), ['status' => 401]);
	}
	$user_obj = get_userdata($user->ID);
	$access = gadv_jwt_encode(['sub' => $user->ID, 'email' => $user->user_email], 900);
	$refresh = gadv_jwt_encode(['sub' => $user->ID, 'email' => $user->user_email, 'rt' => 1], 60 * 60 * 24 * 30);
	$resp = ['accessToken' => $access, 'refreshToken' => $refresh, 'user' => gadv_user_public($user_obj)];
	return rest_ensure_response($resp);
}

function gadv_auth_register($request) {
	$body = json_decode($request->get_body(), true);
	$email = isset($body['email']) ? sanitize_email($body['email']) : '';
	$password = isset($body['password']) ? $body['password'] : wp_generate_password();
	$full_name = isset($body['full_name']) ? sanitize_text_field($body['full_name']) : '';
	$username = isset($body['username']) ? sanitize_user($body['username'], true) : sanitize_user(current(explode('@', $email)), true);
	if (empty($email)) return new WP_Error('invalid', 'Email required', ['status'=>400]);
	if (email_exists($email)) return new WP_Error('exists', 'Email already in use', ['status'=>409]);
	$user_id = wp_create_user($username, $password, $email);
	if (is_wp_error($user_id)) return $user_id;
	if (!empty($full_name)) wp_update_user(['ID' => $user_id, 'display_name' => $full_name]);
	// Return tokens like login
	$user_obj = get_userdata($user_id);
	$access = gadv_jwt_encode(['sub' => $user_id, 'email' => $email], 900);
	$refresh = gadv_jwt_encode(['sub' => $user_id, 'email' => $email, 'rt' => 1], 60 * 60 * 24 * 30);
	$resp = ['accessToken' => $access, 'refreshToken' => $refresh, 'user' => gadv_user_public($user_obj)];
	return rest_ensure_response($resp);
}

function gadv_auth_refresh($request) {
	$body = json_decode($request->get_body(), true);
	$refresh = isset($body['refreshToken']) ? $body['refreshToken'] : null;
	if (!$refresh) return new WP_Error('invalid', 'Missing refresh token', ['status'=>400]);
	$payload = gadv_jwt_verify($refresh);
	if (!$payload || !isset($payload['sub'])) return new WP_Error('invalid', 'Invalid refresh token', ['status'=>401]);
	$user_id = intval($payload['sub']);
	$user = get_userdata($user_id);
	if (!$user) return new WP_Error('not_found', 'User not found', ['status'=>404]);
	$access = gadv_jwt_encode(['sub' => $user_id, 'email' => $user->user_email], 900);
	$new_refresh = gadv_jwt_encode(['sub' => $user_id, 'email' => $user->user_email, 'rt' => 1], 60 * 60 * 24 * 30);
	return rest_ensure_response(['accessToken' => $access, 'refreshToken' => $new_refresh, 'user' => gadv_user_public($user)]);
}

function gadv_user_public($user_obj) {
	if (!$user_obj) return null;
	$avatar = get_avatar_url($user_obj->ID);
	$meta = get_user_meta($user_obj->ID);
	return [
		'id' => $user_obj->ID,
		'email' => $user_obj->user_email,
		'username' => $user_obj->user_login,
		'full_name' => $user_obj->display_name ?: $user_obj->user_login,
		'avatar_url' => $avatar,
		'is_demo' => !empty($meta['gadv_is_demo'][0]) ? boolval($meta['gadv_is_demo'][0]) : false,
		'location' => $meta['gadv_location'][0] ?? null,
	];
}

function gadv_community_highlights($request) {
	$args = ['number' => 20, 'meta_key' => 'gadv_is_demo', 'meta_value' => '1'];
	$users = get_users($args);
	$items = [];
	foreach ($users as $u) {
		$items[] = gadv_user_public($u);
	}
	return rest_ensure_response(['items' => $items, 'total' => count($items)]);
}

function gadv_user_by_username($request) {
	$username = $request->get_param('username');
	$user = get_user_by('login', $username);
	if (!$user) return new WP_Error('not_found', 'User not found', ['status' => 404]);
	return rest_ensure_response(gadv_user_public($user));
}

function gadv_posts_feed($request) {
	$page = max(1, intval($request->get_param('page') ?: 1));
	$per_page = min(50, max(1, intval($request->get_param('limit') ?: 20)));
	$args = [
		'post_type' => 'post',
		'post_status' => 'publish',
		'paged' => $page,
		'posts_per_page' => $per_page,
	];
	$q = new WP_Query($args);
	$items = [];
	foreach ($q->posts as $p) {
		$items[] = [
			'id' => $p->ID,
			'author_id' => $p->post_author,
			'content' => $p->post_content,
			'created_at' => $p->post_date_gmt,
			'title' => $p->post_title,
		];
	}
	return rest_ensure_response(['items' => $items, 'total' => intval($q->found_posts), 'page' => $page]);
}

function gadv_posts_create($request) {
	$payload = json_decode($request->get_body(), true);
	$user = gadv_get_request_user($request);
	if (!$user) return new WP_Error('unauthorized', 'Authentication required', ['status' => 401]);
	$postarr = [
		'post_title' => isset($payload['title']) ? sanitize_text_field($payload['title']) : '',
		'post_content' => isset($payload['content']) ? wp_kses_post($payload['content']) : '',
		'post_status' => 'publish',
		'post_author' => $user->ID,
	];
	$post_id = wp_insert_post($postarr);
	if (is_wp_error($post_id)) return $post_id;
	return rest_ensure_response(['id' => $post_id]);
}

function gadv_post_react($request) {
	global $wpdb;
	$post_id = intval($request->get_param('id'));
	$body = json_decode($request->get_body(), true);
	$type = isset($body['type']) ? sanitize_text_field($body['type']) : 'LIKE';
	$user = gadv_get_request_user($request);
	if (!$user) return new WP_Error('unauthorized', 'Authentication required', ['status' => 401]);
	$table = $wpdb->prefix . 'gadv_reactions';
	// Insert or update (unique post_id,user_id constraint)
	$exists = $wpdb->get_row($wpdb->prepare("SELECT id FROM $table WHERE post_id=%d AND user_id=%d", $post_id, $user->ID));
	if ($exists) {
		$wpdb->update($table, ['type' => $type], ['id' => $exists->id]);
	} else {
		$wpdb->insert($table, ['post_id' => $post_id, 'user_id' => $user->ID, 'type' => $type]);
	}
	// Update post meta count
	$count = $wpdb->get_var($wpdb->prepare("SELECT COUNT(*) FROM $table WHERE post_id=%d", $post_id));
	update_post_meta($post_id, 'gadv_reaction_count', intval($count));
	return rest_ensure_response(['reaction_count' => intval($count)]);
}

function gadv_get_request_user($request) {
	$auth = $request->get_header('authorization');
	if (!$auth) return null;
	if (stripos($auth, 'bearer ') === 0) {
		$token = trim(substr($auth, 7));
		$payload = gadv_jwt_verify($token);
		if ($payload && isset($payload['sub'])) {
			$u = get_userdata(intval($payload['sub']));
			return $u ?: null;
		}
	}
	return null;
}

function gadv_require_jwt() {
	// WordPress permission callback: check Authorization header
	$headers = getallheaders();
	$auth = isset($headers['Authorization']) ? $headers['Authorization'] : (isset($headers['authorization']) ? $headers['authorization'] : null);
	if (!$auth) return false;
	if (stripos($auth, 'bearer ') === 0) {
		$token = trim(substr($auth, 7));
		return (bool) gadv_jwt_verify($token);
	}
	return false;
}

// Ensure plugin file is readable by code inspection tools
// End of file
