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

function gadv_admin_demo_verify($request) {
	// Run basic demo validation checks and return issues array
	$issues = [];
	// Example check: demo users exist
	$users = get_users(['meta_key' => 'is_demo', 'meta_value' => '1']);
	$issues[] = ['check' => 'demo_users_present', 'ok' => count($users) > 0, 'detail' => count($users) . ' demo users'];
	// Check demo posts count via meta
	global $wpdb;
	$posts = $wpdb->get_var("SELECT COUNT(*) FROM {$wpdb->posts} p JOIN {$wpdb->postmeta} m ON p.ID=m.post_id WHERE m.meta_key='is_demo' AND m.meta_value='1'");
	$issues[] = ['check' => 'demo_posts', 'ok' => intval($posts) > 0, 'detail' => intval($posts) . ' demo posts'];
	return rest_ensure_response(['issues' => $issues]);
}

function gadv_admin_user_set_status($request) {
	$id = intval($request->get_param('id'));
	$body = json_decode($request->get_body(), true);
	$status = sanitize_text_field($body['status'] ?? 'ACTIVE');
	$reason = sanitize_text_field($body['reason'] ?? '');
	// map statuses to user meta
	update_user_meta($id, 'gadv_status', $status);
	if ($reason) update_user_meta($id, 'gadv_status_reason', $reason);
	return rest_ensure_response(['ok' => true]);
}

/**
 * Create a user report (frontend: POST /reports)
 * Expected body: { targetType: 'USER'|'POST'|..., targetId: number, category: string, details?: string }
 */
function gadv_reports_create($request) {
	global $wpdb;
	$user = gadv_get_request_user($request);
	if (!$user) return new WP_Error('unauthorized', 'Authentication required', ['status' => 401]);
	$body = json_decode($request->get_body(), true);
	$targetType = isset($body['targetType']) ? sanitize_text_field($body['targetType']) : '';
	$targetId = isset($body['targetId']) ? intval($body['targetId']) : 0;
	$category = isset($body['category']) ? sanitize_text_field($body['category']) : '';
	$details = isset($body['details']) ? wp_kses_post($body['details']) : '';
	if (!$targetType || !$targetId) return new WP_Error('invalid', 'targetType and targetId required', ['status' => 400]);
	$table = $wpdb->prefix . 'gadv_reports';
	$wpdb->insert($table, [
		'reporter_id' => $user->ID,
		'entity_type' => $targetType,
		'entity_id' => $targetId,
		'reason' => $category,
		'details' => $details,
		'status' => 'OPEN',
		'created_at' => current_time('mysql', 1),
	]);
	return rest_ensure_response(['ok' => true, 'id' => $wpdb->insert_id]);
}

function gadv_admin_user_verify($request) {
	$id = intval($request->get_param('id'));
	update_user_meta($id, 'gadv_email_verified', 1);
	return rest_ensure_response(['ok' => true]);
}

// --- Events handlers ---
/** Unique slug for events/groups: lowercase, dashes, short random suffix when taken. */
function gadv_unique_slug($table, $text) {
	global $wpdb;
	$base = sanitize_title($text);
	if ($base === '') $base = 'item';
	$slug = $base;
	$n = 0;
	while ($wpdb->get_var($wpdb->prepare("SELECT 1 FROM $table WHERE slug=%s", $slug))) {
		$n++;
		$slug = substr($base, 0, 50) . '-' . strtolower(wp_generate_password(4, false, false));
		if ($n >= 5) break;
	}
	return $slug;
}

function gadv_events_list($request) {
	global $wpdb;
	$limit = min(100, intval($request->get_param('limit') ?? 30));
	$rows = $wpdb->get_results($wpdb->prepare("SELECT * FROM {$wpdb->prefix}gadv_events ORDER BY starts_at ASC LIMIT %d", $limit));
	$viewer = gadv_get_request_user($request);
	$items = [];
	foreach ($rows as $e) {
		$eid = intval($e->id);
		$going = intval($wpdb->get_var($wpdb->prepare("SELECT COUNT(*) FROM {$wpdb->prefix}gadv_event_rsvps WHERE event_id=%d AND rsvp='GOING'", $eid)));
		$interested = intval($wpdb->get_var($wpdb->prepare("SELECT COUNT(*) FROM {$wpdb->prefix}gadv_event_rsvps WHERE event_id=%d AND rsvp='INTERESTED'", $eid)));
		$my_rsvp = null;
		if ($viewer) {
			$my_rsvp = $wpdb->get_var($wpdb->prepare("SELECT rsvp FROM {$wpdb->prefix}gadv_event_rsvps WHERE event_id=%d AND user_id=%d", $eid, $viewer->ID));
		}
		$organizer = !empty($e->created_by) ? get_userdata(intval($e->created_by)) : null;
		$e->going_count = $going;
		$e->interested_count = $interested;
		$e->my_rsvp = $my_rsvp ?: null;
		$e->organizer_username = $organizer ? $organizer->user_login : null;
		$items[] = $e;
	}
	return rest_ensure_response(['items' => $items, 'total' => count($items)]);
}

function gadv_events_create($request) {
	global $wpdb;
	$body = json_decode($request->get_body(), true);
	$user = gadv_get_request_user($request);
	if (!$user) return new WP_Error('unauthorized', 'Authentication required', ['status' => 401]);
	$title = sanitize_text_field($body['title'] ?? '');
	$desc = isset($body['description']) ? wp_kses_post($body['description']) : '';
	$location = sanitize_text_field($body['location'] ?? '');
	$starts = isset($body['startsAt']) ? sanitize_text_field($body['startsAt']) : null;
	$community = isset($body['community']) ? sanitize_text_field($body['community']) : '';
	if (!$title || !$location || !$starts) return new WP_Error('invalid', 'Missing fields', ['status' => 400]);
	$slug = gadv_unique_slug($wpdb->prefix . 'gadv_events', $title);
	$wpdb->insert($wpdb->prefix . 'gadv_events', [
		'slug' => $slug, 'title' => $title, 'description' => $desc, 'location' => $location,
		'starts_at' => $starts, 'created_by' => $user->ID,
	]);
	$event = $wpdb->get_row($wpdb->prepare("SELECT * FROM {$wpdb->prefix}gadv_events WHERE id=%d", $wpdb->insert_id));
	return rest_ensure_response(['id' => intval($event->id), 'event' => $event]);
}

function gadv_event_rsvp($request) {
	global $wpdb;
	$slug = sanitize_text_field($request->get_param('slug'));
	$body = json_decode($request->get_body(), true);
	$rsvp = sanitize_text_field($body['rsvp'] ?? 'NONE');
	$user = gadv_get_request_user($request);
	if (!$user) return new WP_Error('unauthorized', 'Authentication required', ['status' => 401]);
	$event = $wpdb->get_row($wpdb->prepare("SELECT * FROM {$wpdb->prefix}gadv_events WHERE slug=%s", $slug));
	if (!$event) return new WP_Error('not_found', 'Event not found', ['status' => 404]);
	// upsert into gadv_event_rsvps
	$table = $wpdb->prefix . 'gadv_event_rsvps';
	if ($rsvp === 'NONE') {
		$wpdb->delete($table, ['event_id' => $event->id, 'user_id' => $user->ID]);
		return rest_ensure_response(['ok' => true, 'rsvp' => null]);
	}
	$wpdb->replace($table, ['event_id' => $event->id, 'user_id' => $user->ID, 'rsvp' => $rsvp, 'created_at' => current_time('mysql',1)]);
	return rest_ensure_response(['ok' => true, 'rsvp' => $rsvp]);
}


function gadv_post_vote($request) {
	global $wpdb;
	$post_id = intval($request->get_param('id'));
	$body = json_decode($request->get_body(), true);
	// Frontend sends camelCase optionId; snake_case accepted too.
	$option = isset($body['optionId']) ? intval($body['optionId']) : (isset($body['option_id']) ? intval($body['option_id']) : 0);
	$user = gadv_get_request_user($request);
	if (!$user) return new WP_Error('unauthorized', 'Authentication required', ['status' => 401]);
	if (!$option) return new WP_Error('invalid', 'Option required', ['status' => 400]);
	// Map post -> poll
	$poll = $wpdb->get_var($wpdb->prepare("SELECT id FROM {$wpdb->prefix}gadv_polls WHERE post_id=%d", $post_id));
	if (!$poll) return new WP_Error('not_found', 'Poll not found', ['status' => 404]);
	$table_votes = $wpdb->prefix . 'gadv_poll_votes';
	$wpdb->replace($table_votes, ['poll_id' => $poll, 'option_id' => $option, 'user_id' => $user->ID]);
	$count = $wpdb->get_var($wpdb->prepare("SELECT COUNT(*) FROM {$wpdb->prefix}gadv_poll_votes WHERE poll_id=%d AND option_id=%d", $poll, $option));
	$wpdb->update($wpdb->prefix . 'gadv_poll_options', ['votes' => $count], ['id' => $option]);
	// Return the full option result set like the previous backend
	$options = [];
	$total = 0;
	foreach ($wpdb->get_results($wpdb->prepare("SELECT id, label, votes FROM {$wpdb->prefix}gadv_poll_options WHERE poll_id=%d ORDER BY id ASC", $poll)) as $o) {
		$options[] = ['id' => intval($o->id), 'label' => $o->label, 'votes' => intval($o->votes)];
		$total += intval($o->votes);
	}
	return rest_ensure_response(['ok' => true, 'voted' => true, 'option_votes' => intval($count), 'totalVotes' => $total, 'options' => $options]);
}

function gadv_post_share($request) {
	global $wpdb;
	$post_id = intval($request->get_param('id'));
	$body = json_decode($request->get_body(), true);
	$user = gadv_get_request_user($request);
	if (!$user) return new WP_Error('unauthorized', 'Authentication required', ['status' => 401]);
	// simple share: insert into gadv_shares table if exists, else increment meta
	$table = $wpdb->prefix . 'gadv_shares';
	$existsTable = $wpdb->get_var($wpdb->prepare("SHOW TABLES LIKE %s", $wpdb->esc_like($wpdb->prefix . 'gadv_shares')));
	if ($existsTable) {
		$wpdb->insert($wpdb->prefix . 'gadv_shares', ['post_id' => $post_id, 'user_id' => $user->ID, 'created_at' => current_time('mysql',1)]);
		$count = $wpdb->get_var($wpdb->prepare("SELECT COUNT(*) FROM {$wpdb->prefix}gadv_shares WHERE post_id=%d", $post_id));
		update_post_meta($post_id, 'gadv_share_count', intval($count));
		return rest_ensure_response(['share_count' => intval($count)]);
	}
	$count = intval(get_post_meta($post_id, 'gadv_share_count', true) ?? 0) + 1;
	update_post_meta($post_id, 'gadv_share_count', $count);
	return rest_ensure_response(['share_count' => $count]);
}

function gadv_user_upload_asset($request) {
	$kind = sanitize_text_field($request->get_param('kind'));
	$user = gadv_get_request_user($request);
	if (!$user) return new WP_Error('unauthorized', 'Authentication required', ['status' => 401]);
	// WordPress handles file uploads via $_FILES; use WP functions
	if (empty($_FILES) || !isset($_FILES['image'])) return new WP_Error('invalid', 'Image required', ['status' => 400]);
	require_once(ABSPATH . 'wp-admin/includes/file.php');
	require_once(ABSPATH . 'wp-admin/includes/image.php');
	$file = $_FILES['image'];
	$overrides = ['test_form' => false];
	$move = wp_handle_upload($file, $overrides);
	if (isset($move['error'])) return new WP_Error('upload_failed', $move['error'], ['status' => 500]);
	$filename = $move['file'];
	$filetype = wp_check_filetype(basename($filename), null);
	$attachment = [
		'post_mime_type' => $filetype['type'],
		'post_title' => sanitize_text_field(basename($filename)),
		'post_content' => '',
		'post_status' => 'inherit'
	];
	$attach_id = wp_insert_attachment($attachment, $filename);
	if (!is_wp_error($attach_id)) {
		$meta = wp_generate_attachment_metadata($attach_id, $filename);
		wp_update_attachment_metadata($attach_id, $meta);
		$url = wp_get_attachment_url($attach_id);
		if ($kind === 'avatar') update_user_meta($user->ID, 'gadv_avatar', $url);
		else if ($kind === 'cover') update_user_meta($user->ID, 'gadv_cover', $url);
		return rest_ensure_response(['id' => $attach_id, 'url' => $url]);
	}
	return new WP_Error('upload_failed', 'Failed to insert attachment', ['status' => 500]);
}

// --- Businesses endpoints ---
function gadv_businesses_list($request) {
	global $wpdb;
	$q = sanitize_text_field($request->get_param('q') ?? '');
	$category = sanitize_text_field($request->get_param('category') ?? '');
	$limit = intval($request->get_param('limit') ?? 30);
	$where = [];
	if ($q !== '') $where[] = $wpdb->prepare("name LIKE %s", '%' . $wpdb->esc_like($q) . '%');
	if ($category !== '') $where[] = $wpdb->prepare("category=%s", $category);
	$table = $wpdb->prefix . 'gadv_businesses';
	if (!empty($where)) $sql = "SELECT * FROM $table WHERE " . implode(' AND ', $where) . " LIMIT %d";
	else $sql = "SELECT * FROM $table LIMIT %d";
	$rows = $wpdb->get_results($wpdb->prepare($sql, $limit));
	return rest_ensure_response(['items' => $rows]);
}

function gadv_businesses_create($request) {
	global $wpdb;
	$body = json_decode($request->get_body(), true);
	$user = gadv_get_request_user($request);
	if (!$user) return new WP_Error('unauthorized', 'Authentication required', ['status' => 401]);
	$name = sanitize_text_field($body['name'] ?? '');
	if (!$name) return new WP_Error('invalid', 'Name required', ['status' => 400]);
	$category = sanitize_text_field($body['category'] ?? '');
	$description = isset($body['description']) ? wp_kses_post($body['description']) : '';
	$area = sanitize_text_field($body['area'] ?? '');
	$phone = sanitize_text_field($body['phone'] ?? '');
	$table = $wpdb->prefix . 'gadv_businesses';
	$wpdb->insert($table, ['name' => $name, 'category' => $category, 'description' => $description, 'area' => $area, 'phone' => $phone, 'created_by' => $user->ID]);
	return rest_ensure_response(['id' => $wpdb->insert_id]);
}


// --- Additional auth helpers using DB tables ---
function gadv_create_refresh_token_row($user_id, $expires_seconds = 2592000) {
	global $wpdb;
	$token = bin2hex(random_bytes(32));
	$hash = wp_hash_password($token);
	$expires = date('Y-m-d H:i:s', time() + $expires_seconds);
	$wpdb->insert($wpdb->prefix . 'gadv_refresh_tokens', ['user_id' => $user_id, 'token_hash' => $hash, 'expires_at' => $expires, 'created_at' => current_time('mysql', 1)]);
	$id = $wpdb->insert_id;
	return ['id' => $id, 'token' => $token];
}

function gadv_verify_refresh_token($token) {
	global $wpdb;
	$rows = $wpdb->get_results("SELECT * FROM {$wpdb->prefix}gadv_refresh_tokens WHERE revoked_at IS NULL AND expires_at > NOW() ORDER BY id DESC");
	foreach ($rows as $r) {
		if (wp_check_password($token, $r->token_hash)) return $r;
	}
	return null;
}

// --- Auth endpoints implementations ---
function gadv_auth_me($request) {
	$user = gadv_get_request_user($request);
	if (!$user) return new WP_Error('unauthorized', 'Authentication required', ['status' => 401]);
	$public = gadv_user_public($user);
	$profile = gadv_user_profile_payload($user->ID);
	// Documented flat contract (id, email, username, full_name, avatar_url,
	// is_demo, location) is preserved at the top level; `user` and `profile`
	// objects are additive so the SPA can read { user, profile } like the
	// previous backend did.
	return rest_ensure_response(array_merge($public, ['user' => $public, 'profile' => $profile]));
}

function gadv_auth_logout($request) {
	// If refresh token provided in body, revoke it. Otherwise noop.
	global $wpdb;
	$body = json_decode($request->get_body(), true);
	$rt = $body['refreshToken'] ?? null;
	if ($rt) {
		// Try to find the matching token row by comparing hashes directly.
		// gadv_verify_refresh_token only returns non-revoked, non-expired rows;
		// to ensure logout always revokes the supplied token (even if timing
		// or state makes gadv_verify_refresh_token miss it), search all rows
		// and compare with wp_check_password, then mark revoked_at.
		$rows = $wpdb->get_results("SELECT * FROM {$wpdb->prefix}gadv_refresh_tokens ORDER BY id DESC");
		foreach ($rows as $row) {
			if (wp_check_password($rt, $row->token_hash)) {
				$wpdb->update($wpdb->prefix . 'gadv_refresh_tokens', ['revoked_at' => current_time('mysql', 1)], ['id' => $row->id]);
				break;
			}
		}
	}
	return rest_ensure_response(['ok' => true]);
}

/**
 * Profile fields for the authenticated user, read from user meta.
 * Returned by /auth/me as `profile` (matches the previous backend shape).
 */
function gadv_user_profile_payload($user_id) {
	$m = get_user_meta($user_id);
	$arr = function($key) use ($m) {
		$raw = isset($m[$key][0]) ? trim((string) $m[$key][0]) : '';
		if ($raw === '') return [];
		$parts = explode(',', $raw);
		$out = [];
		foreach ($parts as $p) { $p = trim($p); if ($p !== '') $out[] = $p; }
		return $out;
	};
	$val = function($key) use ($m) {
		return isset($m[$key][0]) && $m[$key][0] !== '' ? $m[$key][0] : null;
	};
	return [
		'bio'          => $val('gadv_bio'),
		'gender'       => $val('gadv_gender'),
		'date_of_birth'=> $val('gadv_dob'),
		'location'     => $val('gadv_location'),
		'hometown'     => $val('gadv_hometown'),
		'community'    => $val('gadv_community'),
		'ethnic_group' => $val('gadv_ethnic_group'),
		'occupation'   => $val('gadv_occupation'),
		'education'    => $val('gadv_education'),
		'interests'    => $arr('gadv_interests'),
		'languages'    => $arr('gadv_languages'),
		'avatar_url'   => get_avatar_url($user_id),
		'cover_url'    => $val('gadv_cover'),
	];
}

/** POST /auth/change-password (JWT). Body: { currentPassword, newPassword } */
function gadv_auth_change_password($request) {
	$user = gadv_get_request_user($request);
	if (!$user) return new WP_Error('unauthorized', 'Authentication required', ['status' => 401]);
	$body = json_decode($request->get_body(), true);
	$current = isset($body['currentPassword']) ? (string) $body['currentPassword'] : '';
	$new = isset($body['newPassword']) ? (string) $body['newPassword'] : '';
	if ($current === '' || strlen($new) < 8) {
		return new WP_Error('invalid', 'currentPassword and newPassword (min 8 characters) are required', ['status' => 400]);
	}
	if (!wp_check_password($current, $user->user_pass, $user->ID)) {
		return new WP_Error('auth_failed', 'Current password is incorrect', ['status' => 401]);
	}
	wp_set_password($new, $user->ID);
	// Revoke every refresh token for this user so all sessions must log in again.
	global $wpdb;
	$wpdb->query($wpdb->prepare(
		"UPDATE {$wpdb->prefix}gadv_refresh_tokens SET revoked_at = %s WHERE user_id = %d AND revoked_at IS NULL",
		current_time('mysql', 1), $user->ID
	));
	return rest_ensure_response(['ok' => true, 'message' => 'Password updated — please log in again with your new password.']);
}

/** POST /auth/change-email (JWT). Body: { newEmail, currentPassword } */
function gadv_auth_change_email($request) {
	$user = gadv_get_request_user($request);
	if (!$user) return new WP_Error('unauthorized', 'Authentication required', ['status' => 401]);
	$body = json_decode($request->get_body(), true);
	$newEmail = isset($body['newEmail']) ? sanitize_email($body['newEmail']) : '';
	$current = isset($body['currentPassword']) ? (string) $body['currentPassword'] : '';
	if (!$newEmail || !is_email($newEmail)) return new WP_Error('invalid', 'A valid newEmail is required', ['status' => 400]);
	if ($current === '') return new WP_Error('invalid', 'currentPassword is required', ['status' => 400]);
	if (!wp_check_password($current, $user->user_pass, $user->ID)) {
		return new WP_Error('auth_failed', 'Password is incorrect', ['status' => 401]);
	}
	if (email_exists($newEmail)) return new WP_Error('exists', 'That email is already in use', ['status' => 409]);
	global $wpdb;
	$token = bin2hex(random_bytes(20));
	$wpdb->insert($wpdb->prefix . 'gadv_email_tokens', [
		'user_id'    => $user->ID,
		'purpose'    => 'CHANGE_EMAIL',
		'token_hash' => wp_hash_password($token),
		'payload'    => $newEmail,
		'expires_at' => date('Y-m-d H:i:s', time() + 3600),
		'created_at' => current_time('mysql', 1),
	]);
	$link = home_url('/app/settings?confirmEmail=' . $token);
	wp_mail($newEmail, 'GADAVIRAL email change confirmation', "Confirm your new email address: $link\n\nIf you did not request this, ignore this email.", ['From' => 'GADAVIRAL <admin@gadaviral.com>']);
	return rest_ensure_response(['ok' => true, 'message' => 'Confirmation email sent to ' . $newEmail . '. Your email updates after you confirm.']);
}

function gadv_auth_forgot_password($request) {
	global $wpdb;
	$body = json_decode($request->get_body(), true);
	$email = isset($body['email']) ? sanitize_email($body['email']) : '';
	if (!$email) return new WP_Error('invalid', 'Email required', ['status' => 400]);
	$user = get_user_by('email', $email);
	if ($user) {
		$token = bin2hex(random_bytes(20));
		$hash = wp_hash_password($token);
		$expires = date('Y-m-d H:i:s', time() + 3600);
		$wpdb->insert($wpdb->prefix . 'gadv_email_tokens', ['user_id' => $user->ID, 'purpose' => 'RESET_PASSWORD', 'token_hash' => $hash, 'expires_at' => $expires, 'created_at' => current_time('mysql', 1)]);
		$link = home_url('/app/reset?token=' . $token);
		wp_mail($email, 'GADAVIRAL password reset', "Reset your password: $link\n\nIf you did not request this, ignore this email.", ['From' => 'GADAVIRAL <admin@gadaviral.com>']);
	}
	// Always return success to avoid email enumeration
	return rest_ensure_response(['ok' => true]);
}

function gadv_auth_reset_password($request) {
	global $wpdb;
	$body = json_decode($request->get_body(), true);
	$token = $body['token'] ?? '';
	$password = $body['password'] ?? '';
	if (!$token || !$password) return new WP_Error('invalid', 'Missing token or password', ['status' => 400]);
	$rows = $wpdb->get_results($wpdb->prepare("SELECT * FROM {$wpdb->prefix}gadv_email_tokens WHERE purpose='RESET_PASSWORD' AND consumed_at IS NULL AND expires_at > NOW()"));
	$found = null;
	foreach ($rows as $r) {
		if (wp_check_password($token, $r->token_hash)) { $found = $r; break; }
	}
	if (!$found) return new WP_Error('invalid', 'Invalid or expired token', ['status' => 400]);
	$user_id = intval($found->user_id);
	wp_set_password($password, $user_id);
	$wpdb->update($wpdb->prefix . 'gadv_email_tokens', ['consumed_at' => current_time('mysql', 1)], ['id' => $found->id]);
	return rest_ensure_response(['ok' => true]);
}

function gadv_auth_verify_otp($request) {
	// Simplified: treat verify-otp as email verification with OTP code in token field
	global $wpdb;
	$body = json_decode($request->get_body(), true);
	$email = sanitize_email($body['email'] ?? '');
	$otp = sanitize_text_field($body['otp'] ?? '');
	if (!$email || !$otp) return new WP_Error('invalid', 'Missing email or otp', ['status' => 400]);
	$user = get_user_by('email', $email);
	if (!$user) return new WP_Error('not_found', 'User not found', ['status' => 404]);
	$rows = $wpdb->get_results($wpdb->prepare("SELECT * FROM {$wpdb->prefix}gadv_email_tokens WHERE purpose='OTP_VERIFY' AND user_id=%d AND consumed_at IS NULL AND expires_at > NOW()", $user->ID));
	foreach ($rows as $r) {
		if ($r->otp === $otp) {
			update_user_meta($user->ID, 'gadv_email_verified', 1);
			$wpdb->update($wpdb->prefix . 'gadv_email_tokens', ['consumed_at' => current_time('mysql',1)], ['id' => $r->id]);
			return rest_ensure_response(['ok' => true]);
		}
	}
	return new WP_Error('invalid', 'Invalid OTP', ['status' => 400]);
}

function gadv_auth_resend_verification($request) {
	global $wpdb;
	$body = json_decode($request->get_body(), true);
	$email = sanitize_email($body['email'] ?? '');
	if (!$email) return new WP_Error('invalid', 'Email required', ['status' => 400]);
	$user = get_user_by('email', $email);
	if (!$user) return rest_ensure_response(['ok' => true]);
	$otp = rand(100000,999999);
	$hash = wp_hash_password((string)$otp);
	$expires = date('Y-m-d H:i:s', time() + 600);
	$wpdb->insert($wpdb->prefix . 'gadv_email_tokens', ['user_id' => $user->ID, 'purpose' => 'OTP_VERIFY', 'otp' => $otp, 'token_hash' => $hash, 'expires_at' => $expires, 'created_at' => current_time('mysql',1)]);
	wp_mail($email, 'GADAVIRAL verification code', "Your verification code is: $otp\n\nThis code expires in 10 minutes.", ['From' => 'GADAVIRAL <admin@gadaviral.com>']);
	return rest_ensure_response(['ok' => true]);
}

function gadv_auth_google_url($request) {
	// Google OAuth is not configured here. Return helpful error if not.
	$client = get_option('gadv_google_client_id');
	if (!$client) return new WP_Error('not_configured', 'Google sign-in not configured', ['status' => 501]);
	return rest_ensure_response(['url' => '']);
}

// --- User profile update ---
function gadv_user_update_me($request) {
	$user = gadv_get_request_user($request);
	if (!$user) return new WP_Error('unauthorized', 'Authentication required', ['status' => 401]);
	$body = json_decode($request->get_body(), true);
	$update = [];
	// Frontend sends camelCase (fullName); snake_case accepted too.
	if (isset($body['fullName'])) $update['display_name'] = sanitize_text_field($body['fullName']);
	elseif (isset($body['full_name'])) $update['display_name'] = sanitize_text_field($body['full_name']);
	if (!empty($update)) wp_update_user(array_merge(['ID' => $user->ID], $update));
	// Scalar profile fields → user meta (keys mirror the previous backend).
	$scalar = [
		'location' => 'gadv_location', 'hometown' => 'gadv_hometown',
		'community' => 'gadv_community', 'occupation' => 'gadv_occupation',
		'education' => 'gadv_education', 'gender' => 'gadv_gender',
		'dateOfBirth' => 'gadv_dob', 'date_of_birth' => 'gadv_dob',
	];
	foreach ($scalar as $key => $meta) {
		if (array_key_exists($key, $body)) update_user_meta($user->ID, $meta, sanitize_text_field((string) $body[$key]));
	}
	if (isset($body['bio'])) update_user_meta($user->ID, 'gadv_bio', wp_kses_post($body['bio']));
	// ethnicGroup / ethnic_group (enum values pass through sanitized)
	if (isset($body['ethnicGroup'])) update_user_meta($user->ID, 'gadv_ethnic_group', sanitize_text_field((string) $body['ethnicGroup']));
	elseif (isset($body['ethnic_group'])) update_user_meta($user->ID, 'gadv_ethnic_group', sanitize_text_field((string) $body['ethnic_group']));
	// interests / languages arrive as arrays from the frontend
	foreach (['interests' => 'gadv_interests', 'languages' => 'gadv_languages'] as $key => $meta) {
		if (isset($body[$key])) {
			$list = is_array($body[$key]) ? $body[$key] : explode(',', (string) $body[$key]);
			$clean = [];
			foreach ($list as $item) { $item = trim(sanitize_text_field((string) $item)); if ($item !== '') $clean[] = $item; }
			update_user_meta($user->ID, $meta, implode(', ', array_slice($clean, 0, 20)));
		}
	}
	$public = gadv_user_public(get_userdata($user->ID));
	return rest_ensure_response(array_merge($public, ['user' => $public, 'profile' => gadv_user_profile_payload($user->ID)]));
}

// --- Single post retrieval ---
function gadv_post_get($request) {
	$id = intval($request->get_param('id'));
	$p = get_post($id);
	if (!$p || $p->post_type !== 'post') return new WP_Error('not_found', 'Post not found', ['status' => 404]);
	if ($p->post_status !== 'publish') return new WP_Error('not_found', 'Post not found', ['status' => 404]);
	$viewer = gadv_get_request_user($request);
	// Record a view for authenticated viewers (best-effort)
	if ($viewer && intval($viewer->ID) !== intval($p->post_author)) {
		$views = intval(get_post_meta($id, 'gadv_view_count', true));
		update_post_meta($id, 'gadv_view_count', $views + 1);
	}
	return rest_ensure_response(['post' => gadv_hydrate_post($p, $viewer ? $viewer->ID : null)]);
}

function gadv_comment_replies($request) {
	$cid = intval($request->get_param('comment_id'));
	$replies = get_comments(['parent' => $cid, 'status' => 'approve']);
	$out = [];
	foreach ($replies as $r) {
		$author = $r->user_id ? get_userdata(intval($r->user_id)) : null;
		$out[] = [
			'id' => $r->comment_ID,
			'author_id' => $r->user_id,
			'content' => $r->comment_content,
			'created_at' => $r->comment_date_gmt,
			'author_username' => $author ? $author->user_login : null,
			'author_name' => $author ? ($author->display_name ?: $author->user_login) : null,
			'author_avatar' => $author ? get_avatar_url($author->ID) : null,
		];
	}
	return rest_ensure_response(['items' => $out, 'total' => count($out)]);
}

function gadv_posts_media_upload($request) {
	// The composer uploads multipart form-data: field "media" (array, up to 6)
	// plus content/visibility — and expects a post to be created (like the
	// previous backend's POST /posts/media). A bare "file" upload (attachment
	// only) is still supported for backwards compatibility.
	$user = gadv_get_request_user($request);
	if (!$user) return new WP_Error('unauthorized', 'Authentication required', ['status' => 401]);
	require_once(ABSPATH . 'wp-admin/includes/file.php');
	require_once(ABSPATH . 'wp-admin/includes/image.php');
	$files = [];
	if (!empty($_FILES['media']) && isset($_FILES['media']['name'])) {
		$names = $_FILES['media']['name'];
		if (is_array($names)) {
			foreach ($names as $i => $n) {
				if (($_FILES['media']['error'][$i] ?? UPLOAD_ERR_NO_FILE) === UPLOAD_ERR_OK && $n !== '') {
					$files[] = [
						'name' => $n,
						'type' => $_FILES['media']['type'][$i],
						'tmp_name' => $_FILES['media']['tmp_name'][$i],
						'error' => $_FILES['media']['error'][$i],
						'size' => $_FILES['media']['size'][$i],
					];
				}
			}
		}
	} elseif (!empty($_FILES['file']) && ($_FILES['file']['error'] ?? UPLOAD_ERR_NO_FILE) === UPLOAD_ERR_OK) {
		$files[] = $_FILES['file'];
	}
	$body = $request->get_body_params();
	$content = isset($body['content']) ? wp_kses_post($body['content']) : '';
	$visibility = isset($body['visibility']) && in_array($body['visibility'], ['PUBLIC', 'FOLLOWERS', 'GROUP', 'PRIVATE'], true) ? $body['visibility'] : 'PUBLIC';
	if (empty($files) && trim($content) === '') {
		return new WP_Error('invalid', 'No file uploaded and no content provided', ['status' => 400]);
	}
	// Create the post first (PHOTO, or VIDEO when a video file is included)
	$has_video = false;
	foreach ($files as $f) {
		if (strpos((string) $f['type'], 'video/') === 0) $has_video = true;
	}
	$post_id = wp_insert_post([
		'post_title' => '',
		'post_content' => $content,
		'post_status' => 'publish',
		'post_author' => $user->ID,
	]);
	if (is_wp_error($post_id)) return $post_id;
	update_post_meta(intval($post_id), 'gadv_type', $has_video ? 'VIDEO' : 'PHOTO');
	update_post_meta(intval($post_id), 'gadv_visibility', $visibility);
	$overrides = ['test_form' => false, 'mimes' => null];
	$attached = [];
	$position = 0;
	foreach ($files as $f) {
		$move = wp_handle_upload($f, $overrides);
		if (isset($move['error'])) continue;
		$filename = $move['file'];
		$filetype = wp_check_filetype(basename($filename), null);
		$attachment = ['post_mime_type' => $filetype['type'], 'post_title' => sanitize_file_name(basename($filename)), 'post_content' => '', 'post_status' => 'inherit', 'menu_order' => $position];
		$attach_id = wp_insert_attachment($attachment, $filename, intval($post_id));
		if (!is_wp_error($attach_id)) {
			$attach_data = wp_generate_attachment_metadata($attach_id, $filename);
			wp_update_attachment_metadata($attach_id, $attach_data);
			$attached[] = ['id' => intval($attach_id), 'url' => wp_get_attachment_url($attach_id)];
			$position++;
		}
	}
	$p = get_post($post_id);
	return rest_ensure_response([
		'id' => intval($post_id),
		'post' => gadv_hydrate_post($p, $user->ID),
		'media' => $attached,
	]);
}

// --- Blocks & mutes endpoints ---
add_action('rest_api_init', function() {
	register_rest_route('gadaviral/v1', '/users/(?P<username>[^/]+)/block', [ 'methods'=>'POST','callback'=>'gadv_block_user','permission_callback'=>'gadv_require_jwt' ]);
	register_rest_route('gadaviral/v1', '/users/(?P<username>[^/]+)/block', [ 'methods'=>'DELETE','callback'=>'gadv_unblock_user','permission_callback'=>'gadv_require_jwt' ]);
	register_rest_route('gadaviral/v1', '/users/(?P<username>[^/]+)/mute', [ 'methods'=>'POST','callback'=>'gadv_mute_user','permission_callback'=>'gadv_require_jwt' ]);
	register_rest_route('gadaviral/v1', '/users/me/blocks', [ 'methods'=>'GET','callback'=>'gadv_get_my_blocks','permission_callback'=>'gadv_require_jwt' ]);
	register_rest_route('gadaviral/v1', '/users/me/deactivate', [ 'methods'=>'POST','callback'=>'gadv_deactivate_me','permission_callback'=>'gadv_require_jwt' ]);
});

// Development-only outbox for local testing. Permission: WP_DEBUG OR current user is admin
add_action('rest_api_init', function() {
	register_rest_route('gadaviral/v1', '/dev/outbox', [
		'methods' => 'GET',
		'callback' => 'gadv_dev_outbox',
		'permission_callback' => function() {
			if (defined('WP_DEBUG') && WP_DEBUG) return true;
			if (is_user_logged_in() && current_user_can('manage_options')) return true;
			return false;
		}
	]);
});

function gadv_dev_outbox($request) {
	global $wpdb;
	$table = $wpdb->prefix . 'gadv_email_tokens';
	$email = sanitize_email($request->get_param('email') ?? '');
	$rows = $wpdb->get_results("SELECT id,user_id,purpose,otp,expires_at,payload,created_at FROM $table ORDER BY created_at DESC LIMIT 200");
	if ($email !== '') {
		$items = [];
		foreach ($rows as $r) {
			$owner = get_userdata(intval($r->user_id));
			if ($owner && strcasecmp($owner->user_email, $email) === 0) $items[] = $r;
		}
	} else {
		$items = $rows;
	}
	// Frontend reads res.emails (previous backend shape); items kept for compatibility.
	return rest_ensure_response(['items' => $items, 'emails' => $items]);
}

// Admin/demo endpoints (non-destructive). Only available to users with manage_options.
add_action('rest_api_init', function() {
	register_rest_route('gadaviral/v1', '/admin/demo/stats', [ 'methods'=>'GET', 'callback'=>'gadv_admin_demo_stats', 'permission_callback'=>function(){return is_user_logged_in() && current_user_can('manage_options');} ]);
	register_rest_route('gadaviral/v1', '/admin/demo/verify', [ 'methods'=>'GET', 'callback'=>'gadv_admin_demo_verify', 'permission_callback'=>function(){return is_user_logged_in() && current_user_can('manage_options');} ]);
	register_rest_route('gadaviral/v1', '/admin/demo/seed', [ 'methods'=>'POST', 'callback'=>'gadv_admin_demo_seed', 'permission_callback'=>function(){return is_user_logged_in() && current_user_can('manage_options');} ]);
	register_rest_route('gadaviral/v1', '/admin/demo/wipe', [ 'methods'=>'POST', 'callback'=>'gadv_admin_demo_wipe', 'permission_callback'=>function(){return is_user_logged_in() && current_user_can('manage_options');} ]);
	// Admin users listing
	register_rest_route('gadaviral/v1', '/admin/users', [ 'methods'=>'GET', 'callback'=>'gadv_admin_users_list', 'permission_callback'=>function(){return is_user_logged_in() && current_user_can('manage_options');} ]);
	register_rest_route('gadaviral/v1', '/admin/users/(?P<id>\d+)/status', [ 'methods'=>'POST', 'callback'=>'gadv_admin_user_set_status', 'permission_callback'=>function(){return is_user_logged_in() && current_user_can('manage_options');} ]);
	register_rest_route('gadaviral/v1', '/admin/users/(?P<id>\d+)/verify', [ 'methods'=>'POST', 'callback'=>'gadv_admin_user_verify', 'permission_callback'=>function(){return is_user_logged_in() && current_user_can('manage_options');} ]);
	register_rest_route('gadaviral/v1', '/admin/analytics', [ 'methods'=>'GET', 'callback'=>'gadv_admin_analytics', 'permission_callback'=>function(){return is_user_logged_in() && current_user_can('manage_options');} ]);
	register_rest_route('gadaviral/v1', '/admin/audit-logs', [ 'methods'=>'GET', 'callback'=>'gadv_admin_audit_logs', 'permission_callback'=>function(){return is_user_logged_in() && current_user_can('manage_options');} ]);
	// Moderation endpoints
	register_rest_route('gadaviral/v1', '/moderation/queue', [ 'methods'=>'GET', 'callback'=>'gadv_moderation_queue', 'permission_callback'=>function(){return is_user_logged_in() && current_user_can('moderate_comments');} ]);
	register_rest_route('gadaviral/v1', '/moderation/reports/(?P<id>\d+)/handle', [ 'methods'=>'POST', 'callback'=>'gadv_handle_report', 'permission_callback'=>function(){return is_user_logged_in() && current_user_can('moderate_comments');} ]);
	register_rest_route('gadaviral/v1', '/moderation/posts/(?P<id>\d+)/(?P<action>[^/]+)', [ 'methods'=>'POST', 'callback'=>'gadv_moderation_post_action', 'permission_callback'=>function(){return is_user_logged_in() && current_user_can('moderate_comments');} ]);

	// Events endpoints
	register_rest_route('gadaviral/v1', '/events', [ 'methods'=>'GET', 'callback'=>'gadv_events_list', 'permission_callback'=>'__return_true' ]);
	register_rest_route('gadaviral/v1', '/events', [ 'methods'=>'POST', 'callback'=>'gadv_events_create', 'permission_callback'=>'gadv_require_jwt' ]);
	register_rest_route('gadaviral/v1', '/events/(?P<slug>[^/]+)/rsvp', [ 'methods'=>'POST', 'callback'=>'gadv_event_rsvp', 'permission_callback'=>'gadv_require_jwt' ]);
});

function gadv_admin_users_list($request) {
	$q = $request->get_param('q');
	$limit = min(100, max(1, intval($request->get_param('limit') ?: 30)));
	$args = ['number' => $limit];
	if ($q) $args['search'] = '*' . $q . '*';
	$args['search_columns'] = ['user_login', 'user_email', 'display_name'];
	$users = get_users($args);
	$items = [];
	foreach ($users as $u) $items[] = gadv_user_public($u);
	return rest_ensure_response(['items' => $items, 'total' => count($items)]);
}

function gadv_admin_analytics($request) {
	global $wpdb;
	$out = [
		'users' => $wpdb->get_var("SELECT COUNT(ID) FROM {$wpdb->users}"),
		'posts' => $wpdb->get_var("SELECT COUNT(ID) FROM {$wpdb->posts} WHERE post_type='post'"),
		'comments' => $wpdb->get_var("SELECT COUNT(comment_ID) FROM {$wpdb->comments}"),
	];
	return rest_ensure_response($out);
}

function gadv_admin_audit_logs($request) {
	// Audit trail mapped from the reports table (additive shape matching the
	// previous backend: id, created_at, actor_username, action, entity_type, entity_id)
	global $wpdb;
	$items = [];
	foreach ($wpdb->get_results("SELECT * FROM {$wpdb->prefix}gadv_reports ORDER BY created_at DESC LIMIT 100") as $r) {
		$actor = $r->reporter_id ? get_userdata(intval($r->reporter_id)) : null;
		$items[] = [
			'id' => intval($r->id),
			'created_at' => $r->created_at,
			'actor_username' => $actor ? $actor->user_login : null,
			'action' => 'REPORT_' . $r->status,
			'entity_type' => $r->entity_type,
			'entity_id' => intval($r->entity_id),
		];
	}
	return rest_ensure_response(['items' => $items, 'total' => count($items)]);
}

function gadv_moderation_queue($request) {
	global $wpdb;
	$items = [];
	foreach ($wpdb->get_results("SELECT * FROM {$wpdb->prefix}gadv_reports WHERE status IN ('OPEN','REVIEWING') ORDER BY created_at ASC LIMIT 200") as $r) {
		$reporter = $r->reporter_id ? get_userdata(intval($r->reporter_id)) : null;
		$items[] = [
			'id' => intval($r->id),
			'reporter_id' => intval($r->reporter_id),
			'reporter_username' => $reporter ? $reporter->user_login : null,
			'target_type' => $r->entity_type,
			'target_id' => intval($r->entity_id),
			'category' => $r->reason,
			'details' => $r->details,
			'status' => $r->status,
			'created_at' => $r->created_at,
		];
	}
	// Flagged content: posts parked in pending review by moderators
	$flagged = [];
	foreach (get_posts(['post_type' => 'post', 'post_status' => 'pending', 'posts_per_page' => 50]) as $p) {
		$author = get_userdata(intval($p->post_author));
		$flagged[] = [
			'id' => intval($p->ID),
			'content' => $p->post_content,
			'type' => get_post_meta($p->ID, 'gadv_type', true) ?: 'TEXT',
			'status' => 'PENDING_REVIEW',
			'created_at' => $p->post_date_gmt ?: $p->post_date,
			'author_username' => $author ? $author->user_login : null,
		];
	}
	return rest_ensure_response(['items' => $items, 'total' => count($items), 'flaggedPosts' => $flagged]);
}

function gadv_handle_report($request) {
	global $wpdb;
	$id = intval($request->get_param('id'));
	$body = json_decode($request->get_body(), true);
	// Frontend actions: REVIEWING | RESOLVED | DISMISSED (legacy: dismiss/flag_post)
	$action = strtoupper(sanitize_text_field($body['action'] ?? 'DISMISSED'));
	$removeTarget = !empty($body['removeTarget']);
	$map = ['REVIEWING' => 'REVIEWING', 'RESOLVED' => 'RESOLVED', 'DISMISSED' => 'DISMISSED', 'FLAG_POST' => 'RESOLVED'];
	if (!isset($map[$action])) return new WP_Error('invalid', 'Unknown action', ['status' => 400]);
	$report = $wpdb->get_row($wpdb->prepare("SELECT * FROM {$wpdb->prefix}gadv_reports WHERE id=%d", $id));
	if (!$report) return new WP_Error('not_found', 'Report not found', ['status' => 404]);
	// Optionally remove the reported post when resolving with removeTarget
	if ($removeTarget && $action === 'RESOLVED' && $report->entity_type === 'POST') {
		$post_id = intval($report->entity_id);
		if ($post_id && get_post($post_id)) {
			wp_update_post(['ID' => $post_id, 'post_status' => 'pending']);
		}
	}
	$wpdb->update($wpdb->prefix . 'gadv_reports', ['status' => $map[$action]], ['id' => $id]);
	return rest_ensure_response(['ok' => true]);
}

function gadv_moderation_post_action($request) {
	$id = intval($request->get_param('id'));
	$action = strtolower(sanitize_text_field($request->get_param('action')));
	// Frontend uses remove|restore; legacy names hide|approve are kept.
	if (in_array($action, ['remove', 'hide'], true)) {
		wp_update_post(['ID' => $id, 'post_status' => 'pending']);
		return rest_ensure_response(['ok' => true]);
	}
	if (in_array($action, ['restore', 'approve'], true)) {
		wp_update_post(['ID' => $id, 'post_status' => 'publish']);
		return rest_ensure_response(['ok' => true]);
	}
	return new WP_Error('invalid', 'Unknown action', ['status' => 400]);
}

function gadv_admin_demo_stats($request) {
	global $wpdb;
	$demoUserIds = $wpdb->get_col("SELECT user_id FROM {$wpdb->usermeta} WHERE meta_key='gadv_is_demo' AND meta_value='1' LIMIT 5000");
	$demoCount = count($demoUserIds);
	$demoPosts = $wpdb->get_var("SELECT COUNT(*) FROM {$wpdb->posts} p JOIN {$wpdb->postmeta} m ON p.ID=m.post_id WHERE m.meta_key='is_demo' AND m.meta_value='1' AND p.post_type='post'");
	$out = [
		'users' => intval($demoCount),
		'posts' => intval($demoPosts),
		'comments' => intval($wpdb->get_var("SELECT COUNT(*) FROM {$wpdb->comments}")),
		'reactions' => intval($wpdb->get_var("SELECT COUNT(*) FROM {$wpdb->prefix}gadv_reactions")),
		'shares' => intval($wpdb->get_var("SELECT COUNT(*) FROM {$wpdb->prefix}gadv_shares")),
		'views' => 0,
		'follows' => intval($wpdb->get_var("SELECT COUNT(*) FROM {$wpdb->prefix}gadv_follows")),
		'notifications' => intval($wpdb->get_var("SELECT COUNT(*) FROM {$wpdb->prefix}gadv_notifications")),
		'batches' => [],
		'counts' => [
			'wp_users' => intval($wpdb->get_var("SELECT COUNT(ID) FROM {$wpdb->users}")),
			'wp_posts' => intval($wpdb->get_var("SELECT COUNT(ID) FROM {$wpdb->posts} WHERE post_type='post'")),
			'gadv_reactions' => intval($wpdb->get_var("SELECT COUNT(*) FROM {$wpdb->prefix}gadv_reactions")),
			'gadv_notifications' => intval($wpdb->get_var("SELECT COUNT(*) FROM {$wpdb->prefix}gadv_notifications")),
			'gadv_conversations' => intval($wpdb->get_var("SELECT COUNT(*) FROM {$wpdb->prefix}gadv_conversations")),
		],
	];
	return rest_ensure_response($out);
}

function gadv_admin_demo_seed($request) {
	// For safety, do not perform destructive or uncontrolled seeding here. Return an informational message.
	return new WP_Error('not_supported', 'Demo seeding must be performed via WP-CLI on a staging environment. See scripts/wp_importer_runner.php for import tooling.', ['status'=>501]);
}

function gadv_admin_demo_wipe($request) {
	// For safety, do not wipe production data via API. Provide instruction response.
	return new WP_Error('not_supported', 'Demo wipe is disabled via REST API. Use WP-CLI on staging to remove demo data if required.', ['status'=>501]);
}

function gadv_block_user($request) {
	global $wpdb;
	$username = sanitize_text_field($request->get_param('username'));
	$target = get_user_by('login', $username);
	$user = gadv_get_request_user($request);
	if (!$user) return new WP_Error('unauthorized','Authentication required', ['status'=>401]);
	if (!$target) return new WP_Error('not_found','User not found', ['status'=>404]);
	if ($user->ID == $target->ID) return new WP_Error('invalid','Cannot block yourself', ['status'=>400]);
	$wpdb->replace($wpdb->prefix.'gadv_blocks', ['blocker_id'=>$user->ID,'blocked_id'=>$target->ID]);
	return rest_ensure_response(['ok'=>true]);
}

function gadv_unblock_user($request) {
	global $wpdb;
	$username = sanitize_text_field($request->get_param('username'));
	$target = get_user_by('login', $username);
	$user = gadv_get_request_user($request);
	if (!$user) return new WP_Error('unauthorized','Authentication required', ['status'=>401]);
	if (!$target) return new WP_Error('not_found','User not found', ['status'=>404]);
	$wpdb->delete($wpdb->prefix.'gadv_blocks', ['blocker_id'=>$user->ID,'blocked_id'=>$target->ID]);
	return rest_ensure_response(['ok'=>true]);
}

function gadv_mute_user($request) {
	global $wpdb;
	$username = sanitize_text_field($request->get_param('username'));
	$target = get_user_by('login', $username);
	$user = gadv_get_request_user($request);
	if (!$user) return new WP_Error('unauthorized','Authentication required', ['status'=>401]);
	if (!$target) return new WP_Error('not_found','User not found', ['status'=>404]);
	$until = null;
	$body = json_decode($request->get_body(), true);
	if (!empty($body['until'])) $until = date('Y-m-d H:i:s', strtotime($body['until']));
	$wpdb->replace($wpdb->prefix.'gadv_mutes', ['user_id'=>$user->ID,'muted_id'=>$target->ID,'until_at'=>$until]);
	return rest_ensure_response(['ok'=>true]);
}

function gadv_get_my_blocks($request) {
	global $wpdb;
	$user = gadv_get_request_user($request);
	if (!$user) return new WP_Error('unauthorized','Authentication required', ['status'=>401]);
	$rows = $wpdb->get_results($wpdb->prepare("SELECT blocked_id FROM {$wpdb->prefix}gadv_blocks WHERE blocker_id=%d", $user->ID));
	$items = [];
	foreach ($rows as $r) { $u = get_userdata($r->blocked_id); if ($u) $items[] = gadv_user_public($u); }
	return rest_ensure_response(['items'=>$items]);
}

function gadv_deactivate_me($request) {
	$user = gadv_get_request_user($request);
	if (!$user) return new WP_Error('unauthorized','Authentication required', ['status'=>401]);
	update_user_meta($user->ID, 'gadv_deactivated', 1);
	return rest_ensure_response(['ok'=>true]);
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

// Additional tables: refresh tokens, email tokens, blocks, mutes
register_activation_hook(__FILE__, 'gadv_create_auth_tables');
function gadv_create_auth_tables() {
	global $wpdb;
	$charset_collate = $wpdb->get_charset_collate();
	$prefix = $wpdb->prefix;
	$sqls = [];
	$sqls[] = "CREATE TABLE IF NOT EXISTS {$prefix}gadv_refresh_tokens (
		id bigint(20) unsigned NOT NULL AUTO_INCREMENT,
		user_id bigint(20) unsigned NOT NULL,
		token_hash varchar(255) NOT NULL,
		expires_at datetime NOT NULL,
		revoked_at datetime DEFAULT NULL,
		replaced_by bigint(20) DEFAULT NULL,
		user_agent text,
		ip varchar(45),
		created_at datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
		PRIMARY KEY (id)
	) $charset_collate";

	$sqls[] = "CREATE TABLE IF NOT EXISTS {$prefix}gadv_email_tokens (
		id bigint(20) unsigned NOT NULL AUTO_INCREMENT,
		user_id bigint(20) unsigned NOT NULL,
		purpose varchar(64) NOT NULL,
		token_hash varchar(255) DEFAULT NULL,
		otp varchar(16) DEFAULT NULL,
		attempts int DEFAULT 0,
		expires_at datetime NOT NULL,
		consumed_at datetime DEFAULT NULL,
		payload text DEFAULT NULL,
		created_at datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
		PRIMARY KEY (id)
	) $charset_collate";

	$sqls[] = "CREATE TABLE IF NOT EXISTS {$prefix}gadv_blocks (
		blocker_id bigint(20) unsigned NOT NULL,
		blocked_id bigint(20) unsigned NOT NULL,
		created_at datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
		PRIMARY KEY (blocker_id, blocked_id)
	) $charset_collate";

	$sqls[] = "CREATE TABLE IF NOT EXISTS {$prefix}gadv_mutes (
		user_id bigint(20) unsigned NOT NULL,
		muted_id bigint(20) unsigned NOT NULL,
		until_at datetime DEFAULT NULL,
		created_at datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
		PRIMARY KEY (user_id, muted_id)
	) $charset_collate";

	require_once(ABSPATH . 'wp-admin/includes/upgrade.php');
	foreach ($sqls as $sql) dbDelta($sql);
}

// --- Comments endpoints ---
add_action('rest_api_init', function() {
	register_rest_route('gadaviral/v1', '/posts/(?P<id>[^/]+)/comments', [
		'methods' => 'GET',
		'callback' => 'gadv_comments_list',
		'permission_callback' => '__return_true',
	]);
	register_rest_route('gadaviral/v1', '/posts/(?P<id>[^/]+)/comments', [
		'methods' => 'POST',
		'callback' => 'gadv_comments_create',
		'permission_callback' => 'gadv_require_jwt',
	]);
});

function gadv_comments_list($request) {
	$post_id = intval($request->get_param('id'));
	// Top-level comments only; replies come from /posts/comments/:id/replies
	$comments = get_comments(['post_id' => $post_id, 'status' => 'approve', 'parent' => 0]);
	$out = [];
	foreach ($comments as $c) {
		$author = $c->user_id ? get_userdata(intval($c->user_id)) : null;
		$out[] = [
			'id' => $c->comment_ID,
			'author_id' => $c->user_id,
			'content' => $c->comment_content,
			'created_at' => $c->comment_date_gmt,
			'parent_comment_id' => $c->comment_parent ?: null,
			'author_username' => $author ? $author->user_login : null,
			'author_name' => $author ? ($author->display_name ?: $author->user_login) : null,
			'author_avatar' => $author ? get_avatar_url($author->ID) : null,
			'reply_count' => count(get_comments(['post_id' => $post_id, 'status' => 'approve', 'parent' => $c->comment_ID])),
		];
	}
	$total = count($out);
	return rest_ensure_response(['items' => $out, 'total' => $total, 'meta' => ['page' => 1, 'limit' => max($total, 1), 'total' => $total, 'totalPages' => 1]]);
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
	register_rest_route('gadaviral/v1', '/users/(?P<id>[^/]+)/follow', [
		'methods' => 'POST',
		'callback' => 'gadv_follow_user',
		'permission_callback' => 'gadv_require_jwt',
	]);
	register_rest_route('gadaviral/v1', '/users/(?P<id>[^/]+)/unfollow', [
		'methods' => 'POST',
		'callback' => 'gadv_unfollow_user',
		'permission_callback' => 'gadv_require_jwt',
	]);
	// The SPA unfollows with DELETE /users/:username/follow (previous backend contract)
	register_rest_route('gadaviral/v1', '/users/(?P<id>[^/]+)/follow', [
		'methods' => 'DELETE',
		'callback' => 'gadv_unfollow_user',
		'permission_callback' => 'gadv_require_jwt',
	]);
});

function gadv_follow_user($request) {
	global $wpdb;
	$target_user = gadv_resolve_user($request->get_param('id'));
	$user = gadv_get_request_user($request);
	if (!$user) return new WP_Error('unauthorized', 'Authentication required', ['status' => 401]);
	if (!$target_user) return new WP_Error('not_found', 'User not found', ['status' => 404]);
	$target = intval($target_user->ID);
	if (intval($user->ID) === $target) return new WP_Error('invalid', 'Cannot follow yourself', ['status' => 400]);
	$table = $wpdb->prefix . 'gadv_follows';
	$exists = $wpdb->get_row($wpdb->prepare("SELECT 1 FROM $table WHERE follower_id=%d AND followee_id=%d", $user->ID, $target));
	if (!$exists) $wpdb->insert($table, ['follower_id' => $user->ID, 'followee_id' => $target]);
	return rest_ensure_response(['ok' => true, 'following' => true]);
}

function gadv_unfollow_user($request) {
	global $wpdb;
	$target_user = gadv_resolve_user($request->get_param('id'));
	$user = gadv_get_request_user($request);
	if (!$user) return new WP_Error('unauthorized', 'Authentication required', ['status' => 401]);
	if (!$target_user) return new WP_Error('not_found', 'User not found', ['status' => 404]);
	$table = $wpdb->prefix . 'gadv_follows';
	$wpdb->delete($table, ['follower_id' => $user->ID, 'followee_id' => $target_user->ID]);
	return rest_ensure_response(['ok' => true, 'following' => false]);
}

// --- Notifications endpoints ---
add_action('rest_api_init', function() {
	register_rest_route('gadaviral/v1', '/notifications', [
		'methods' => 'GET',
		'callback' => 'gadv_notifications_list',
		'permission_callback' => 'gadv_require_jwt',
	]);
	register_rest_route('gadaviral/v1', '/notifications/mark-read', [
		'methods' => 'POST',
		'callback' => 'gadv_notifications_mark_read',
		'permission_callback' => 'gadv_require_jwt',
	]);
	// Alias used by frontend
	register_rest_route('gadaviral/v1', '/notifications/read', [
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
	$unread = intval($wpdb->get_var($wpdb->prepare("SELECT COUNT(*) FROM $table WHERE user_id=%d AND read_at IS NULL", $user->ID)));
	$items = [];
	foreach ($rows as $n) {
		$actor = $n->actor_id ? get_userdata(intval($n->actor_id)) : null;
		$items[] = [
			'id' => intval($n->id),
			'user_id' => intval($n->user_id),
			'actor_id' => $n->actor_id ? intval($n->actor_id) : null,
			'type' => $n->type,
			'entity_type' => null,
			'entity_id' => $n->entity_id ? intval($n->entity_id) : null,
			'body' => $n->body,
			'read_at' => $n->read_at,
			'created_at' => $n->created_at,
			'actor_username' => $actor ? $actor->user_login : null,
			'actor_name' => $actor ? ($actor->display_name ?: $actor->user_login) : null,
			'actor_avatar' => $actor ? get_avatar_url($actor->ID) : null,
		];
	}
	return rest_ensure_response(['items' => $items, 'total' => count($items), 'unreadCount' => $unread]);
}

function gadv_notifications_mark_read($request) {
	global $wpdb;
	$user = gadv_get_request_user($request);
	if (!$user) return new WP_Error('unauthorized', 'Authentication required', ['status' => 401]);
	$body = json_decode($request->get_body(), true);
	$ids = isset($body['ids']) && is_array($body['ids']) ? array_map('intval', $body['ids']) : [];
	if (empty($ids)) {
		// No ids = mark everything read (previous backend behaviour)
		$wpdb->query($wpdb->prepare("UPDATE {$wpdb->prefix}gadv_notifications SET read_at = NOW() WHERE user_id = %d AND read_at IS NULL", $user->ID));
		return rest_ensure_response(['ok' => true]);
	}
	$in = implode(',', array_fill(0, count($ids), '%d'));
	$query = $wpdb->prepare("UPDATE {$wpdb->prefix}gadv_notifications SET read_at = NOW() WHERE user_id = %d AND id IN ($in)", array_merge([$user->ID], $ids));
	$wpdb->query($query);
	return rest_ensure_response(['ok' => true]);
}

// --- Messaging endpoints (conversations/messages) ---
add_action('rest_api_init', function() {
	register_rest_route('gadaviral/v1', '/conversations', [
		'methods' => 'GET',
		'callback' => 'gadv_conversations_list',
		'permission_callback' => 'gadv_require_jwt',
	]);
	register_rest_route('gadaviral/v1', '/conversations', [
		'methods' => 'POST',
		'callback' => 'gadv_conversation_create',
		'permission_callback' => 'gadv_require_jwt',
	]);
	register_rest_route('gadaviral/v1', '/conversations/(?P<id>\d+)/messages', [
		'methods' => 'GET',
		'callback' => 'gadv_messages_list',
		'permission_callback' => 'gadv_require_jwt',
	]);
	register_rest_route('gadaviral/v1', '/conversations/(?P<id>\d+)/messages', [
		'methods' => 'POST',
		'callback' => 'gadv_message_send',
		'permission_callback' => 'gadv_require_jwt',
	]);
	// Aliases matching frontend path /messages/conversations
	register_rest_route('gadaviral/v1', '/messages/conversations', [ 'methods'=>'GET','callback'=>'gadv_conversations_list','permission_callback'=>'gadv_require_jwt' ]);
	register_rest_route('gadaviral/v1', '/messages/conversations', [ 'methods'=>'POST','callback'=>'gadv_conversation_create','permission_callback'=>'gadv_require_jwt' ]);
	// Note: frontend expects GET/POST at /messages/conversations/:id (without explicit /messages/conversations/:id/messages)
	// Provide compatibility alias that accepts both patterns and returns the same shapes.
	register_rest_route('gadaviral/v1', '/messages/conversations/(?P<id>\d+)', [ 'methods'=>'GET','callback'=>'gadv_messages_list','permission_callback'=>'gadv_require_jwt' ]);
	register_rest_route('gadaviral/v1', '/messages/conversations/(?P<id>\d+)', [ 'methods'=>'POST','callback'=>'gadv_message_send','permission_callback'=>'gadv_require_jwt' ]);

	// Also keep the original /conversations/:id/messages routes for clients that use that path
	register_rest_route('gadaviral/v1', '/conversations/(?P<id>\d+)/messages', [ 'methods'=>'GET','callback'=>'gadv_messages_list','permission_callback'=>'gadv_require_jwt' ]);
	register_rest_route('gadaviral/v1', '/conversations/(?P<id>\d+)/messages', [ 'methods'=>'POST','callback'=>'gadv_message_send','permission_callback'=>'gadv_require_jwt' ]);
});

function gadv_conversations_list($request) {
	global $wpdb;
	$user = gadv_get_request_user($request);
	if (!$user) return new WP_Error('unauthorized', 'Authentication required', ['status' => 401]);
	$table = $wpdb->prefix . 'gadv_conversation_participants';
	$rows = $wpdb->get_results($wpdb->prepare("SELECT conversation_id, last_read_at FROM $table WHERE user_id=%d", $user->ID));
	$out = [];
	foreach ($rows as $r) {
		$conv = $wpdb->get_row($wpdb->prepare("SELECT * FROM {$wpdb->prefix}gadv_conversations WHERE id=%d", $r->conversation_id));
		if (!$conv) continue;
		$cid = intval($conv->id);
		$last = $wpdb->get_var($wpdb->prepare("SELECT content FROM {$wpdb->prefix}gadv_messages WHERE conversation_id=%d ORDER BY created_at DESC LIMIT 1", $cid));
		$unread = intval($wpdb->get_var($wpdb->prepare(
			"SELECT COUNT(*) FROM {$wpdb->prefix}gadv_messages WHERE conversation_id=%d AND sender_id <> %d AND created_at > %s",
			$cid, $user->ID, $r->last_read_at ?: '1970-01-01 00:00:00'
		)));
		// 1:1 conversations surface the "other" participant like the old backend
		$other = null;
		if (intval($conv->is_group) === 0) {
			$op = $wpdb->get_row($wpdb->prepare("SELECT user_id FROM {$wpdb->prefix}gadv_conversation_participants WHERE conversation_id=%d AND user_id <> %d LIMIT 1", $cid, $user->ID));
			if ($op) $other = get_userdata(intval($op->user_id));
		}
		$out[] = [
			'id' => $cid,
			'is_group' => intval($conv->is_group),
			'title' => $conv->title,
			'created_at' => $conv->created_at,
			'last_message_at' => $conv->last_message_at,
			'last_message' => $last,
			'unread' => $unread,
			'other_user_id' => $other ? intval($other->ID) : null,
			'other_username' => $other ? $other->user_login : null,
			'other_name' => $other ? ($other->display_name ?: $other->user_login) : null,
			'other_avatar' => $other ? get_avatar_url($other->ID) : null,
			'other_is_demo' => $other ? !empty(get_user_meta($other->ID, 'gadv_is_demo', true)) : false,
		];
	}
	// Most recent activity first
	usort($out, function($a, $b) {
		return strcmp((string) $b['last_message_at'], (string) $a['last_message_at']);
	});
	return rest_ensure_response(['items' => $out]);
}

function gadv_conversation_create($request) {
	global $wpdb;
	$body = json_decode($request->get_body(), true);
	$user = gadv_get_request_user($request);
	if (!$user) return new WP_Error('unauthorized', 'Authentication required', ['status' => 401]);
	// Previous backend contract: POST { username } starts (or returns) a 1:1 conversation.
	if (!empty($body['username'])) {
		$target = get_user_by('login', sanitize_user($body['username'], true));
		if (!$target) return new WP_Error('not_found', 'User not found', ['status' => 404]);
		if (intval($target->ID) === intval($user->ID)) return new WP_Error('invalid', 'You cannot message yourself', ['status' => 400]);
		// Return the existing 1:1 conversation when there is one
		$existing = $wpdb->get_var($wpdb->prepare(
			"SELECT a.conversation_id FROM {$wpdb->prefix}gadv_conversation_participants a
			 JOIN {$wpdb->prefix}gadv_conversation_participants b ON b.conversation_id = a.conversation_id
			 JOIN {$wpdb->prefix}gadv_conversations c ON c.id = a.conversation_id
			 WHERE a.user_id = %d AND b.user_id = %d AND c.is_group = 0 LIMIT 1",
			$user->ID, $target->ID
		));
		if ($existing) return rest_ensure_response(['id' => intval($existing), 'conversationId' => intval($existing)]);
		$wpdb->insert($wpdb->prefix . 'gadv_conversations', ['is_group' => 0, 'title' => null, 'created_by' => $user->ID]);
		$cid = intval($wpdb->insert_id);
		$wpdb->insert($wpdb->prefix . 'gadv_conversation_participants', ['conversation_id' => $cid, 'user_id' => $user->ID]);
		$wpdb->insert($wpdb->prefix . 'gadv_conversation_participants', ['conversation_id' => $cid, 'user_id' => $target->ID]);
		return rest_ensure_response(['id' => $cid, 'conversationId' => $cid]);
	}
	// Group conversation creation (kept from the earlier implementation)
	$is_group = !empty($body['is_group']) ? 1 : 0;
	$title = isset($body['title']) ? sanitize_text_field($body['title']) : null;
	$wpdb->insert($wpdb->prefix . 'gadv_conversations', ['is_group' => $is_group, 'title' => $title, 'created_by' => $user->ID]);
	$cid = intval($wpdb->insert_id);
	// participants
	$participants = isset($body['participants']) && is_array($body['participants']) ? $body['participants'] : [];
	$wpdb->insert($wpdb->prefix . 'gadv_conversation_participants', ['conversation_id' => $cid, 'user_id' => $user->ID]);
	foreach ($participants as $p) {
		$p = intval($p);
		if ($p && $p !== $user->ID) $wpdb->insert($wpdb->prefix . 'gadv_conversation_participants', ['conversation_id' => $cid, 'user_id' => $p]);
	}
	return rest_ensure_response(['id' => $cid, 'conversationId' => $cid]);
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
	$items = [];
	foreach ($rows as $m) {
		$sender = get_userdata(intval($m->sender_id));
		$items[] = [
			'id' => intval($m->id),
			'conversation_id' => intval($m->conversation_id),
			'sender_id' => intval($m->sender_id),
			'content' => $m->content,
			'media_url' => $m->media_url,
			'status' => $m->status,
			'created_at' => $m->created_at,
			'sender_username' => $sender ? $sender->user_login : null,
			'sender_name' => $sender ? ($sender->display_name ?: $sender->user_login) : null,
			'is_mine' => intval($m->sender_id) === intval($user->ID),
		];
	}
	// Reading the thread marks it read (previous backend behaviour)
	$wpdb->update($wpdb->prefix . 'gadv_conversation_participants', ['last_read_at' => current_time('mysql', 1)], ['conversation_id' => $cid, 'user_id' => $user->ID]);
	return rest_ensure_response(['items' => $items, 'total' => count($items)]);
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
	$mid = intval($wpdb->insert_id);
	$wpdb->update($wpdb->prefix . 'gadv_conversations', ['last_message_at' => current_time('mysql', 1)], ['id' => $cid]);
	return rest_ensure_response(['id' => $mid, 'message' => [
		'id' => $mid,
		'conversation_id' => $cid,
		'sender_id' => intval($user->ID),
		'content' => $content,
		'media_url' => $media,
		'created_at' => current_time('mysql', 1),
		'sender_username' => $user->user_login,
		'sender_name' => $user->display_name ?: $user->user_login,
		'is_mine' => true,
	]]);
}

// --- Groups endpoints (basic) ---
add_action('rest_api_init', function() {
	register_rest_route('gadaviral/v1', '/groups', [
		'methods' => 'GET',
		'callback' => 'gadv_groups_list',
		'permission_callback' => '__return_true',
	]);
	register_rest_route('gadaviral/v1', '/groups', [
		'methods' => 'POST',
		'callback' => 'gadv_groups_create',
		'permission_callback' => 'gadv_require_jwt',
	]);
	register_rest_route('gadaviral/v1', '/groups/(?P<slug>[^/]+)', [
		'methods' => 'GET',
		'callback' => 'gadv_group_get',
		'permission_callback' => '__return_true',
	]);
	register_rest_route('gadaviral/v1', '/groups/(?P<slug>[^/]+)/join', [
		'methods' => 'POST',
		'callback' => 'gadv_group_join',
		'permission_callback' => 'gadv_require_jwt',
	]);
	register_rest_route('gadaviral/v1', '/groups/(?P<slug>[^/]+)/leave', [
		'methods' => 'POST',
		'callback' => 'gadv_group_leave',
		'permission_callback' => 'gadv_require_jwt',
	]);
	// Create reports (user-submitted reports) - frontend: POST /reports
	register_rest_route('gadaviral/v1', '/reports', [
		'methods' => 'POST',
		'callback' => 'gadv_reports_create',
		'permission_callback' => 'gadv_require_jwt',
	]);
});

function gadv_groups_list($request) {
	global $wpdb;
	$viewer = gadv_get_request_user($request);
	$q = sanitize_text_field($request->get_param('q') ?? '');
	$limit = min(100, max(1, intval($request->get_param('limit') ?: 100)));
	$sql = "SELECT * FROM {$wpdb->prefix}gadv_groups";
	if ($q !== '') {
		$like = '%' . $wpdb->esc_like($q) . '%';
		$rows = $wpdb->get_results($wpdb->prepare("$sql WHERE name LIKE %s OR description LIKE %s ORDER BY member_count DESC, created_at DESC LIMIT %d", $like, $like, $limit));
	} else {
		$rows = $wpdb->get_results($wpdb->prepare("$sql ORDER BY member_count DESC, created_at DESC LIMIT %d", $limit));
	}
	$items = [];
	foreach ($rows as $g) {
		$items[] = gadv_group_row($g, $viewer);
	}
	return rest_ensure_response(['items' => $items, 'total' => count($items)]);
}

/** Group row with viewer state (joined) attached. */
function gadv_group_row($g, $viewer) {
	global $wpdb;
	$gid = intval($g->id);
	$joined = false;
	$my_role = null;
	if ($viewer) {
		$joined = (bool) $wpdb->get_var($wpdb->prepare("SELECT 1 FROM {$wpdb->prefix}gadv_group_members WHERE group_id=%d AND user_id=%d", $gid, $viewer->ID));
		if ($joined) {
			$my_role = $wpdb->get_var($wpdb->prepare("SELECT role FROM {$wpdb->prefix}gadv_group_members WHERE group_id=%d AND user_id=%d", $gid, $viewer->ID));
		}
	}
	$creator_username = null;
	if (!empty($g->creator_id)) {
		$creator = get_userdata(intval($g->creator_id));
		$creator_username = $creator ? $creator->user_login : null;
	}
	$member_count = intval($g->member_count);
	if ($member_count === 0) {
		$member_count = intval($wpdb->get_var($wpdb->prepare("SELECT COUNT(*) FROM {$wpdb->prefix}gadv_group_members WHERE group_id=%d", $gid)));
	}
	return [
		'id' => $gid,
		'slug' => $g->slug,
		'name' => $g->name,
		'description' => $g->description,
		'cover_url' => $g->cover_url ?? null,
		'avatar_url' => $g->avatar_url ?? null,
		'privacy' => $g->privacy ?: 'PUBLIC',
		'creator_id' => $g->creator_id ? intval($g->creator_id) : null,
		'creator_username' => $creator_username,
		'member_count' => $member_count,
		'created_at' => $g->created_at,
		'is_demo' => false,
		'joined' => $joined,
		'my_role' => $my_role,
	];
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
	$viewer = gadv_get_request_user($request);
	return rest_ensure_response(['group' => gadv_group_row($row, $viewer)]);
}

function gadv_group_join($request) {
	global $wpdb;
	$slug = sanitize_text_field($request->get_param('slug'));
	$user = gadv_get_request_user($request);
	if (!$user) return new WP_Error('unauthorized', 'Authentication required', ['status' => 401]);
	$g = $wpdb->get_row($wpdb->prepare("SELECT * FROM {$wpdb->prefix}gadv_groups WHERE slug=%s", $slug));
	if (!$g) return new WP_Error('not_found', 'Group not found', ['status' => 404]);
	$exists = $wpdb->get_row($wpdb->prepare("SELECT * FROM {$wpdb->prefix}gadv_group_members WHERE group_id=%d AND user_id=%d", $g->id, $user->ID));
	if (!$exists) {
		$wpdb->insert($wpdb->prefix . 'gadv_group_members', ['group_id' => $g->id, 'user_id' => $user->ID]);
		$count = intval($wpdb->get_var($wpdb->prepare("SELECT COUNT(*) FROM {$wpdb->prefix}gadv_group_members WHERE group_id=%d", $g->id)));
		$wpdb->update($wpdb->prefix . 'gadv_groups', ['member_count' => $count], ['id' => $g->id]);
	}
	return rest_ensure_response(['ok' => true, 'joined' => true, 'pending' => false]);
}

function gadv_group_leave($request) {
	global $wpdb;
	$slug = sanitize_text_field($request->get_param('slug'));
	$user = gadv_get_request_user($request);
	if (!$user) return new WP_Error('unauthorized', 'Authentication required', ['status' => 401]);
	$g = $wpdb->get_row($wpdb->prepare("SELECT * FROM {$wpdb->prefix}gadv_groups WHERE slug=%s", $slug));
	if (!$g) return new WP_Error('not_found', 'Group not found', ['status' => 404]);
	$wpdb->delete($wpdb->prefix . 'gadv_group_members', ['group_id' => $g->id, 'user_id' => $user->ID]);
	$count = intval($wpdb->get_var($wpdb->prepare("SELECT COUNT(*) FROM {$wpdb->prefix}gadv_group_members WHERE group_id=%d", $g->id)));
	$wpdb->update($wpdb->prefix . 'gadv_groups', ['member_count' => $count], ['id' => $g->id]);
	return rest_ensure_response(['ok' => true, 'joined' => false]);
}

// --- Polls endpoints (basic) ---
add_action('rest_api_init', function() {
	register_rest_route('gadaviral/v1', '/polls/(?P<poll>\d+)/vote', [
		'methods' => 'POST',
		'callback' => 'gadv_poll_vote',
		'permission_callback' => 'gadv_require_jwt',
	]);
	register_rest_route('gadaviral/v1', '/polls/(?P<poll>\d+)', [
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
	register_rest_route('gadaviral/v1', '/search', [
		'methods' => 'GET',
		'callback' => 'gadv_search',
		'permission_callback' => '__return_true',
	]);
});

function gadv_search($request) {
	global $wpdb;
	$q = sanitize_text_field($request->get_param('q') ?? '');
	$empty = ['query' => $q, 'users' => [], 'posts' => [], 'groups' => [], 'pages' => [], 'businesses' => [], 'events' => []];
	if ($q === '') return rest_ensure_response($empty);
	$like = '%' . $wpdb->esc_like($q) . '%';
	// Users
	$users = [];
	foreach (get_users(['search' => "*{$q}*", 'search_columns' => ['user_login', 'display_name', 'user_email'], 'number' => 12]) as $u) {
		$pub = gadv_user_public($u);
		$pub['follower_count'] = intval($wpdb->get_var($wpdb->prepare("SELECT COUNT(*) FROM {$wpdb->prefix}gadv_follows WHERE followee_id = %d", $u->ID)));
		$pub['bio'] = get_user_meta($u->ID, 'gadv_bio', true) ?: null;
		$users[] = $pub;
	}
	// Posts (public content matches)
	$posts = [];
	foreach (get_posts(['s' => $q, 'posts_per_page' => 15, 'post_type' => 'post', 'post_status' => 'publish']) as $p) {
		$author = get_userdata(intval($p->post_author));
		$posts[] = [
			'id' => intval($p->ID),
			'content' => $p->post_content,
			'type' => get_post_meta($p->ID, 'gadv_type', true) ?: 'TEXT',
			'created_at' => $p->post_date_gmt ?: $p->post_date,
			'author_username' => $author ? $author->user_login : null,
			'author_name' => $author ? ($author->display_name ?: $author->user_login) : null,
			'author_avatar' => $author ? get_avatar_url($author->ID) : null,
		];
	}
	// Groups
	$groups = [];
	foreach ($wpdb->get_results($wpdb->prepare("SELECT id, slug, name, description, member_count, privacy FROM {$wpdb->prefix}gadv_groups WHERE name LIKE %s OR description LIKE %s ORDER BY member_count DESC LIMIT 8", $like, $like)) as $g) {
		$g->id = intval($g->id);
		$g->member_count = intval($g->member_count);
		$groups[] = $g;
	}
	// Businesses
	$businesses = [];
	foreach ($wpdb->get_results($wpdb->prepare("SELECT id, name, category, description, area FROM {$wpdb->prefix}gadv_businesses WHERE name LIKE %s OR description LIKE %s LIMIT 8", $like, $like)) as $b) {
		$b->id = intval($b->id);
		$b->verified = false;
		$businesses[] = $b;
	}
	// Events
	$events = [];
	foreach ($wpdb->get_results($wpdb->prepare("SELECT id, slug, title, starts_at, location FROM {$wpdb->prefix}gadv_events WHERE title LIKE %s ORDER BY starts_at ASC LIMIT 8", $like)) as $e) {
		$e->id = intval($e->id);
		$events[] = $e;
	}
	return rest_ensure_response(['query' => $q, 'users' => $users, 'posts' => $posts, 'groups' => $groups, 'pages' => [], 'businesses' => $businesses, 'events' => $events]);
}


global $gadv_db_version;
$gadv_db_version = '0.1';

register_activation_hook(__FILE__, 'gadv_activate');
function gadv_activate() {
	global $wpdb, $gadv_db_version;
	$charset_collate = $wpdb->get_charset_collate();
	$prefix = $wpdb->prefix;

	$tables = [];
	$tables[] = "CREATE TABLE IF NOT EXISTS {$prefix}gadv_businesses (
		id bigint(20) unsigned NOT NULL AUTO_INCREMENT,
		name varchar(255) NOT NULL,
		category varchar(64) DEFAULT NULL,
		description text,
		area varchar(255) DEFAULT NULL,
		phone varchar(64) DEFAULT NULL,
		created_by bigint(20) unsigned DEFAULT NULL,
		created_at datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
		PRIMARY KEY (id)
	) $charset_collate";
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

	// create optional tables used by new handlers
	$opt[] = "CREATE TABLE IF NOT EXISTS {$prefix}gadv_businesses (
		id bigint(20) unsigned NOT NULL AUTO_INCREMENT,
		name varchar(255) NOT NULL,
		category varchar(64) DEFAULT NULL,
		description text,
		area varchar(255) DEFAULT NULL,
		phone varchar(64) DEFAULT NULL,
		created_by bigint(20) unsigned DEFAULT NULL,
		created_at datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
		PRIMARY KEY (id)
	) $charset_collate";
	$opt[] = "CREATE TABLE IF NOT EXISTS {$prefix}gadv_shares (
		id bigint(20) unsigned NOT NULL AUTO_INCREMENT,
		post_id bigint(20) unsigned NOT NULL,
		user_id bigint(20) unsigned NOT NULL,
		created_at datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
		PRIMARY KEY (id)
	) $charset_collate";
	$opt[] = "CREATE TABLE IF NOT EXISTS {$prefix}gadv_events (
		id bigint(20) unsigned NOT NULL AUTO_INCREMENT,
		slug varchar(255) NOT NULL,
		title varchar(255) NOT NULL,
		description text,
		location varchar(255) DEFAULT NULL,
		starts_at datetime DEFAULT NULL,
		created_by bigint(20) unsigned DEFAULT NULL,
		created_at datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
		PRIMARY KEY (id),
		UNIQUE KEY slug_idx (slug)
	) $charset_collate";
	$opt[] = "CREATE TABLE IF NOT EXISTS {$prefix}gadv_event_rsvps (
		event_id bigint(20) unsigned NOT NULL,
		user_id bigint(20) unsigned NOT NULL,
		rsvp varchar(20) DEFAULT 'NONE',
		created_at datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
		PRIMARY KEY (event_id,user_id)
	) $charset_collate";
	foreach ($opt as $sql) dbDelta($sql);

	add_option('gadv_db_version', $gadv_db_version);
}

// Basic JWT helpers (HS256). Secret is stored in the WP option 'gadv_jwt_secret'.
// If no secret has been configured yet, a strong random secret is generated and
// persisted once (additive, non-destructive). Sites that already set the option
// keep their existing secret and sessions stay valid.
function gadv_jwt_secret() {
	$s = get_option('gadv_jwt_secret');
	if (!$s) {
		try {
			$s = bin2hex(random_bytes(32));
		} catch (Exception $e) {
			$s = wp_generate_password(64, false, false);
		}
		add_option('gadv_jwt_secret', $s, '', false);
		if (get_option('gadv_jwt_secret') !== $s) {
			// Option appeared concurrently — prefer the stored value.
			$s = get_option('gadv_jwt_secret');
		}
	}
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
	// Keep health route if already registered by Code Snippets. Only register
	// here if no existing /gadaviral/v1/health route exists.
	$routes = rest_get_server()->get_routes();
	$has_health = isset($routes['/gadaviral/v1/health']);
	if (!$has_health) {
		register_rest_route('gadaviral/v1', '/health', [
			'methods' => 'GET',
			'callback' => 'gadv_health',
			'permission_callback' => '__return_true',
		]);
	}

	register_rest_route('gadaviral/v1', '/auth/login', [
		'methods' => 'POST',
		'callback' => 'gadv_auth_login',
		'permission_callback' => '__return_true',
	]);

	register_rest_route('gadaviral/v1', '/auth/register', [
		'methods' => 'POST',
		'callback' => 'gadv_auth_register',
		'permission_callback' => '__return_true',
	]);

	register_rest_route('gadaviral/v1', '/auth/refresh', [
		'methods' => 'POST',
		'callback' => 'gadv_auth_refresh',
		'permission_callback' => '__return_true',
	]);

	register_rest_route('gadaviral/v1', '/auth/me', [
		'methods' => 'GET',
		'callback' => 'gadv_auth_me',
		'permission_callback' => 'gadv_require_jwt',
	]);

	// NOTE: compatibility alias for /me was removed due to routing conflicts;
	// frontend uses /auth/me so /me is unnecessary and caused hangs in staging.

	register_rest_route('gadaviral/v1', '/auth/logout', [
		'methods' => 'POST',
		'callback' => 'gadv_auth_logout',
		'permission_callback' => 'gadv_require_jwt',
	]);

	register_rest_route('gadaviral/v1', '/auth/forgot-password', [
		'methods' => 'POST',
		'callback' => 'gadv_auth_forgot_password',
		'permission_callback' => '__return_true',
	]);

	register_rest_route('gadaviral/v1', '/auth/reset-password', [
		'methods' => 'POST',
		'callback' => 'gadv_auth_reset_password',
		'permission_callback' => '__return_true',
	]);

	register_rest_route('gadaviral/v1', '/auth/verify-otp', [
		'methods' => 'POST',
		'callback' => 'gadv_auth_verify_otp',
		'permission_callback' => '__return_true',
	]);

	register_rest_route('gadaviral/v1', '/auth/resend-verification', [
		'methods' => 'POST',
		'callback' => 'gadv_auth_resend_verification',
		'permission_callback' => '__return_true',
	]);

	register_rest_route('gadaviral/v1', '/auth/google/url', [
		'methods' => 'GET',
		'callback' => 'gadv_auth_google_url',
		'permission_callback' => '__return_true',
	]);

	// Change password / change email
	register_rest_route('gadaviral/v1', '/auth/change-password', [ 'methods' => 'POST', 'callback' => 'gadv_auth_change_password', 'permission_callback' => 'gadv_require_jwt' ]);
	register_rest_route('gadaviral/v1', '/auth/change-email', [ 'methods' => 'POST', 'callback' => 'gadv_auth_change_email', 'permission_callback' => 'gadv_require_jwt' ]);

	register_rest_route('gadaviral/v1', '/community/highlights', [
		'methods' => 'GET',
		'callback' => 'gadv_community_highlights',
		'permission_callback' => '__return_true',
	]);

	// Businesses endpoints (frontend expects /businesses GET and POST)
	register_rest_route('gadaviral/v1', '/businesses', [
		'methods' => 'GET',
		'callback' => 'gadv_businesses_list',
		'permission_callback' => '__return_true',
	]);
	register_rest_route('gadaviral/v1', '/businesses', [
		'methods' => 'POST',
		'callback' => 'gadv_businesses_create',
		'permission_callback' => 'gadv_require_jwt',
	]);

	register_rest_route('gadaviral/v1', '/users/(?P<username>[a-zA-Z0-9_\-]+)', [
		'methods' => 'GET',
		'callback' => 'gadv_user_by_username',
		'permission_callback' => '__return_true',
	]);

	// Upload avatar/cover: POST /users/me/{kind}
	register_rest_route('gadaviral/v1', '/users/me/(?P<kind>avatar|cover)', [
		'methods' => 'POST',
		'callback' => 'gadv_user_upload_asset',
		'permission_callback' => 'gadv_require_jwt',
		'args' => ['image' => ['required' => true]],
	]);

	register_rest_route('gadaviral/v1', '/users/me', [
		'methods' => 'PATCH',
		'callback' => 'gadv_user_update_me',
		'permission_callback' => 'gadv_require_jwt',
	]);

	register_rest_route('gadaviral/v1', '/posts', [
		'methods' => 'GET',
		'callback' => 'gadv_posts_feed',
		'permission_callback' => '__return_true',
	]);

	register_rest_route('gadaviral/v1', '/posts', [
		'methods' => 'POST',
		'callback' => 'gadv_posts_create',
		'permission_callback' => 'gadv_require_jwt',
	]);

	register_rest_route('gadaviral/v1', '/posts/(?P<id>[^/]+)', [
		'methods' => 'GET',
		'callback' => 'gadv_post_get',
		'permission_callback' => '__return_true',
	]);

	// Compatibility alias: frontend uses PUT /posts/:id/react
	register_rest_route('gadaviral/v1', '/posts/(?P<id>[^/]+)/react', [
		'methods' => 'PUT',
		'callback' => 'gadv_post_react',
		'permission_callback' => 'gadv_require_jwt',
	]);

	// Compatibility: frontend posts votes to /posts/:id/vote
	register_rest_route('gadaviral/v1', '/posts/(?P<id>[^/]+)/vote', [
		'methods' => 'POST',
		'callback' => 'gadv_post_vote',
		'permission_callback' => 'gadv_require_jwt',
	]);

	// Share endpoint
	register_rest_route('gadaviral/v1', '/posts/(?P<id>[^/]+)/share', [
		'methods' => 'POST',
		'callback' => 'gadv_post_share',
		'permission_callback' => 'gadv_require_jwt',
	]);

	register_rest_route('gadaviral/v1', '/posts/(?P<id>[^/]+)/reactions', [
		'methods' => 'POST',
		'callback' => 'gadv_post_react',
		'permission_callback' => 'gadv_require_jwt',
	]);

	register_rest_route('gadaviral/v1', '/posts/(?P<id>[^/]+)/comments', [
		'methods' => 'GET',
		'callback' => 'gadv_comments_list',
		'permission_callback' => '__return_true',
	]);
	register_rest_route('gadaviral/v1', '/posts/(?P<id>[^/]+)/comments', [
		'methods' => 'POST',
		'callback' => 'gadv_comments_create',
		'permission_callback' => 'gadv_require_jwt',
	]);

	// Replies endpoint used by frontend
	register_rest_route('gadaviral/v1', '/posts/comments/(?P<comment_id>[^/]+)/replies', [
		'methods' => 'GET',
		'callback' => 'gadv_comment_replies',
		'permission_callback' => '__return_true',
	]);

	// Media upload for composer
	register_rest_route('gadaviral/v1', '/posts/media', [
		'methods' => 'POST',
		'callback' => 'gadv_posts_media_upload',
		'permission_callback' => 'gadv_require_jwt',
		'args' => ['file' => ['required' => true]],
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
	// Create a persisted refresh token and return plain token to client
	$rt = gadv_create_refresh_token_row($user->ID);
	$refresh_plain = is_array($rt) ? $rt['token'] : $rt;
	$resp = ['accessToken' => $access, 'refreshToken' => $refresh_plain, 'user' => gadv_user_public($user_obj)];
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
	$refresh_plain = gadv_create_refresh_token_row($user_id);
	$resp = ['accessToken' => $access, 'refreshToken' => $refresh_plain, 'user' => gadv_user_public($user_obj)];
	return rest_ensure_response($resp);
}

function gadv_auth_refresh($request) {
	$body = json_decode($request->get_body(), true);
	$refresh = isset($body['refreshToken']) ? $body['refreshToken'] : null;
	if (!$refresh) return new WP_Error('invalid', 'Missing refresh token', ['status'=>400]);
	// Verify server-side persisted refresh tokens and rotate
	$stored = gadv_verify_refresh_token($refresh);
	if (!$stored) return new WP_Error('invalid', 'Invalid or revoked refresh token', ['status'=>401]);
	$user_id = intval($stored->user_id);
	$user = get_userdata($user_id);
	if (!$user) return new WP_Error('not_found', 'User not found', ['status'=>404]);
	// Revoke the old token and create a new persisted refresh token
	global $wpdb;
	$wpdb->update($wpdb->prefix . 'gadv_refresh_tokens', ['revoked_at' => current_time('mysql', 1), 'replaced_by' => $stored->id], ['id' => $stored->id]);
	$rt = gadv_create_refresh_token_row($user_id);
	$new_plain = is_array($rt) ? $rt['token'] : $rt;
	$access = gadv_jwt_encode(['sub' => $user_id, 'email' => $user->user_email], 900);
	return rest_ensure_response(['accessToken' => $access, 'refreshToken' => $new_plain, 'user' => gadv_user_public($user)]);
}

function gadv_user_public($user_obj) {
	if (!$user_obj) return null;
	$avatar = get_avatar_url($user_obj->ID);
	$meta = get_user_meta($user_obj->ID);
	$status = isset($meta['gadv_status'][0]) && $meta['gadv_status'][0] !== '' ? $meta['gadv_status'][0] : 'ACTIVE';
	return [
		'id' => $user_obj->ID,
		'email' => $user_obj->user_email,
		'username' => $user_obj->user_login,
		'full_name' => $user_obj->display_name ?: $user_obj->user_login,
		'avatar_url' => $avatar,
		'is_demo' => !empty($meta['gadv_is_demo'][0]) ? boolval($meta['gadv_is_demo'][0]) : false,
		'location' => $meta['gadv_location'][0] ?? null,
		// Additive fields consumed by the Profile page and the admin user table.
		'role' => $user_obj->roles ? array_values($user_obj->roles)[0] : 'subscriber',
		'status' => !empty($meta['gadv_deactivated'][0]) ? 'DEACTIVATED' : $status,
		'email_verified' => !empty($meta['gadv_email_verified'][0]) ? boolval($meta['gadv_email_verified'][0]) : false,
		'created_at' => $user_obj->user_registered,
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

/** Resolve a route param that may be a numeric user id OR a username. */
function gadv_resolve_user($param) {
	if ($param === null || $param === '') return null;
	if (ctype_digit((string) $param)) {
		$u = get_userdata(intval($param));
		if ($u) return $u;
	}
	return get_user_by('login', (string) $param);
}

function gadv_user_by_username($request) {
	$username = $request->get_param('username');
	$user = get_user_by('login', $username);
	if (!$user) $user = get_userdata(intval($username));
	if (!$user) return new WP_Error('not_found', 'User not found', ['status' => 404]);
	if (!empty(get_user_meta($user->ID, 'gadv_deactivated', true))) {
		return new WP_Error('not_found', 'User not found', ['status' => 404]);
	}
	global $wpdb;
	$public = gadv_user_public($user);
	$profile = gadv_user_profile_payload($user->ID);
	// Counts (real data from the gadv tables / WP queries)
	$public['follower_count'] = intval($wpdb->get_var($wpdb->prepare("SELECT COUNT(*) FROM {$wpdb->prefix}gadv_follows WHERE followee_id = %d", $user->ID)));
	$public['following_count'] = intval($wpdb->get_var($wpdb->prepare("SELECT COUNT(*) FROM {$wpdb->prefix}gadv_follows WHERE follower_id = %d", $user->ID)));
	$public['posts_count'] = intval(count_user_posts($user->ID, 'post', true));
	$user_full = array_merge($public, $profile);
	// Viewer relationship state (following / followsYou / isSelf / blocked)
	$viewer = gadv_get_request_user($request);
	$viewer_state = ['following' => false, 'followsYou' => false, 'isSelf' => false, 'blocked' => false];
	if ($viewer) {
		$viewer_state['isSelf'] = intval($viewer->ID) === intval($user->ID);
		if (!$viewer_state['isSelf']) {
			$viewer_state['following'] = (bool) $wpdb->get_var($wpdb->prepare("SELECT 1 FROM {$wpdb->prefix}gadv_follows WHERE follower_id = %d AND followee_id = %d", $viewer->ID, $user->ID));
			$viewer_state['followsYou'] = (bool) $wpdb->get_var($wpdb->prepare("SELECT 1 FROM {$wpdb->prefix}gadv_follows WHERE follower_id = %d AND followee_id = %d", $user->ID, $viewer->ID));
			$viewer_state['blocked'] = (bool) $wpdb->get_var($wpdb->prepare("SELECT 1 FROM {$wpdb->prefix}gadv_blocks WHERE blocker_id = %d AND blocked_id = %d", $viewer->ID, $user->ID));
		}
	}
	return rest_ensure_response(['user' => $user_full, 'viewer' => $viewer_state]);
}

/**
 * Hydrate one WP post into the shape the SPA expects (author fields, counts,
 * media, poll, viewer reaction). Mirrors the previous backend's hydratePosts().
 */
function gadv_hydrate_post($p, $viewer_id = null) {
	global $wpdb;
	$pid = intval($p->ID);
	$author = get_userdata(intval($p->post_author));
	$ameta = $author ? get_user_meta($author->ID) : [];
	// Media: attachments linked to this post
	$media = [];
	foreach (get_attached_media('', $pid) as $m) {
		$mime = $m->post_mime_type;
		$media[] = [
			'id' => intval($m->ID),
			'url' => wp_get_attachment_url($m->ID),
			'media_type' => (strpos($mime, 'video/') === 0) ? 'VIDEO' : 'IMAGE',
			'thumb_url' => null,
			'alt_text' => $m->post_excerpt ?: null,
			'position' => intval($m->menu_order),
		];
	}
	// Poll (if any) — reuse the poll id from the first votes row if needed
	$poll = null;
	$poll_row = $wpdb->get_row($wpdb->prepare("SELECT id, question FROM {$wpdb->prefix}gadv_polls WHERE post_id = %d", $pid));
	if ($poll_row) {
		$poll = ['id' => intval($poll_row->id), 'question' => $poll_row->question, 'multiple' => false, 'endsAt' => null, 'options' => [], 'totalVotes' => 0];
		$options = $wpdb->get_results($wpdb->prepare("SELECT id, label, votes FROM {$wpdb->prefix}gadv_poll_options WHERE poll_id = %d ORDER BY id ASC", $poll_row->id));
		foreach ($options as $o) {
			$votes = intval($o->votes);
			$poll['options'][] = ['id' => intval($o->id), 'label' => $o->label, 'votes' => $votes];
			$poll['totalVotes'] += $votes;
		}
	}
	// Counts
	$reaction_count = intval($wpdb->get_var($wpdb->prepare("SELECT COUNT(*) FROM {$wpdb->prefix}gadv_reactions WHERE post_id = %d", $pid)));
	$comment_count = intval(wp_count_comments($pid)->approved);
	$share_count = intval(get_post_meta($pid, 'gadv_share_count', true));
	$view_count = intval(get_post_meta($pid, 'gadv_view_count', true));
	// Viewer state
	$my_reaction = null;
	if ($viewer_id) {
		$my_reaction = $wpdb->get_var($wpdb->prepare("SELECT type FROM {$wpdb->prefix}gadv_reactions WHERE post_id = %d AND user_id = %d", $pid, $viewer_id));
	}
	$type = get_post_meta($pid, 'gadv_type', true) ?: 'TEXT';
	$is_demo = !empty($ameta['gadv_is_demo'][0]);
	return [
		'id' => $pid,
		'author_id' => (string) $p->post_author,
		'type' => $type,
		'content' => $p->post_content,
		'title' => $p->post_title,
		'visibility' => 'PUBLIC',
		'status' => $p->post_status === 'publish' ? 'ACTIVE' : strtoupper($p->post_status),
		'is_demo' => $is_demo,
		'reaction_count' => $reaction_count,
		'comment_count' => $comment_count,
		'share_count' => $share_count,
		'view_count' => $view_count,
		'created_at' => $p->post_date_gmt ?: $p->post_date,
		'edited_at' => null,
		'author_username' => $author ? $author->user_login : null,
		'author_name' => $author ? ($author->display_name ?: $author->user_login) : null,
		'author_avatar' => $author ? get_avatar_url($author->ID) : null,
		'author_is_demo' => $is_demo,
		'media' => $media,
		'poll' => $poll,
		'sharedPost' => null,
		'viewer' => ['reaction' => $my_reaction ?: null],
	];
}

function gadv_posts_feed($request) {
	$page = max(1, intval($request->get_param('page') ?: 1));
	$per_page = min(50, max(1, intval($request->get_param('limit') ?: 20)));
	$args = [
		'post_type' => 'post',
		'post_status' => 'publish',
		'paged' => $page,
		'posts_per_page' => $per_page,
		'orderby' => 'date',
		'order' => 'DESC',
	];
	// Optional author filter: /posts?username=<username>
	$username = $request->get_param('username');
	if ($username) {
		$author = get_user_by('login', sanitize_user($username, true));
		$args['author'] = $author ? $author->ID : -1;
	}
	// Optional type filter: TEXT|PHOTO|VIDEO|POLL|ANNOUNCEMENT (stored in meta)
	$type = $request->get_param('type');
	if ($type && in_array(strtoupper($type), ['TEXT', 'PHOTO', 'VIDEO', 'POLL', 'ANNOUNCEMENT'], true)) {
		$args['meta_query'] = [['key' => 'gadv_type', 'value' => strtoupper($type)]];
	}
	$q = new WP_Query($args);
	$viewer = gadv_get_request_user($request);
	$viewer_id = $viewer ? $viewer->ID : null;
	$items = [];
	foreach ($q->posts as $p) {
		$items[] = gadv_hydrate_post($p, $viewer_id);
	}
	$total = intval($q->found_posts);
	return rest_ensure_response([
		'items' => $items,
		'total' => $total,
		'page' => $page,
		'feed' => (string) ($request->get_param('feed') ?? 'recent'),
		'meta' => [
			'page' => $page,
			'limit' => $per_page,
			'total' => $total,
			'totalPages' => max(1, (int) ceil($total / $per_page)),
		],
	]);
}

function gadv_posts_create($request) {
	$payload = json_decode($request->get_body(), true);
	$user = gadv_get_request_user($request);
	if (!$user) return new WP_Error('unauthorized', 'Authentication required', ['status' => 401]);
	$content = isset($payload['content']) ? wp_kses_post($payload['content']) : '';
	$type = isset($payload['type']) ? strtoupper(sanitize_text_field($payload['type'])) : 'TEXT';
	if (!in_array($type, ['TEXT', 'PHOTO', 'VIDEO', 'POLL', 'ANNOUNCEMENT'], true)) $type = 'TEXT';
	$postarr = [
		'post_title' => isset($payload['title']) ? sanitize_text_field($payload['title']) : '',
		'post_content' => $content,
		'post_status' => 'publish',
		'post_author' => $user->ID,
	];
	$post_id = wp_insert_post($postarr);
	if (is_wp_error($post_id)) return $post_id;
	update_post_meta(intval($post_id), 'gadv_type', $type);
	if (!empty($payload['groupId'])) update_post_meta(intval($post_id), 'gadv_group_id', sanitize_text_field((string) $payload['groupId']));
	// Poll creation: body carries poll = { question, options: [..], multiple? }
	if ($type === 'POLL' && isset($payload['poll']) && is_array($payload['poll'])) {
		global $wpdb;
		$question = isset($payload['poll']['question']) ? sanitize_text_field($payload['poll']['question']) : '';
		$wpdb->insert($wpdb->prefix . 'gadv_polls', ['post_id' => intval($post_id), 'question' => $question]);
		$poll_id = intval($wpdb->insert_id);
		$options = isset($payload['poll']['options']) && is_array($payload['poll']['options']) ? $payload['poll']['options'] : [];
		$pos = 0;
		foreach ($options as $label) {
			$label = sanitize_text_field((string) $label);
			if ($label === '') continue;
			$wpdb->insert($wpdb->prefix . 'gadv_poll_options', ['poll_id' => $poll_id, 'label' => $label, 'votes' => 0]);
			$pos++;
			if ($pos >= 10) break;
		}
	}
	$p = get_post($post_id);
	return rest_ensure_response(['id' => intval($post_id), 'post' => gadv_hydrate_post($p, $user->ID)]);
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
	return rest_ensure_response(['reacted' => true, 'type' => $type, 'changed' => true, 'reaction_count' => intval($count)]);
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
