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
