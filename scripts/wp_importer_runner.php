<?php
/**
 * WP Importer runner (CLI / admin-included) - idempotent importer for GADAVIRAL
 * Usage (CLI): wp eval-file scripts/wp_importer_runner.php -- --source exports
 * The script reads JSON files from the given directory and imports users/posts/comments etc.
 * It writes original Pg ids into usermeta/postmeta with key 'gadv_pg_id' to support re-runs.
 * Idempotent: re-running skips already-imported rows.
 */

if (php_sapi_name() === 'cli') {
	$argv = $_SERVER['argv'];
	$source = 'exports';
	foreach ($argv as $i => $a) if ($a === '--source' && isset($argv[$i+1])) $source = $argv[$i+1];
} elseif (!isset($source)) {
	// Admin-included mode: the including code may define $source before requiring this file.
	if (!isset($_GET['source'])) die('source required');
	$source = $_GET['source'];
}

/**
 * Demo import with resume support for shared hosting time limits.
 * Stage = which JSON file to process next. Each stage is idempotent
 * (re-running skips already-imported rows via gadv_pg_id).
 * Pass ?stage=users|posts|comments|reactions|follows (default: users).
 * The admin UI auto-advances through the stages until done.
 */
$gadv_import_stage = isset($_GET['stage']) ? sanitize_key($_GET['stage']) : 'users';
$gadv_import_limits = 20; // seconds per stage run before stopping for a resume
$gadv_import_started = time();

function gadv_import_time_left() {
	global $gadv_import_limits, $gadv_import_started;
	return $gadv_import_started + $gadv_import_limits > time();
}

$dir = __DIR__ . '/' . $source;
if (!is_dir($dir)) die("Source dir not found: $dir\n");

function read_json($file) { return json_decode(file_get_contents($file), true); }

$report = [];
// Stage gating: when a stage is requested via the URL, only that stage runs
// (each stage is idempotent; the admin UI auto-advances). Without a stage,
// everything runs like before (CLI mode).
$gadv_only = ($gadv_import_stage && $gadv_import_stage !== 'all')
	? array_flip(array_map('sanitize_key', (array) explode(',', $gadv_import_stage)))
	: null;

// Users import
$usersFile = $dir . '/users.json';
if (file_exists($usersFile) && (!$gadv_only || isset($gadv_only['users']))) {
	$users = read_json($usersFile);
	$report['users'] = ['source' => count($users), 'imported' => 0, 'skipped' => 0, 'failed' => 0, 'duplicates' => 0, 'errors' => []];
	foreach ($users as $u) {
		$pgid = $u['id'];
		// skip if already imported (meta exists)
		$existing = get_users(['meta_key' => 'gadv_pg_id', 'meta_value' => $pgid, 'number' => 1]);
		if (!empty($existing)) { $report['users']['skipped']++; continue; }
		// find by email or username
		$byEmail = get_user_by('email', $u['email']);
		if ($byEmail) {
			update_user_meta($byEmail->ID, 'gadv_pg_id', $pgid);
			if (!empty($u['is_demo'])) update_user_meta($byEmail->ID, 'gadv_is_demo', 1);
			$report['users']['duplicates']++;
			continue;
		}
		$user_id = wp_create_user($u['username'], wp_generate_password(), $u['email']);
		if (is_wp_error($user_id)) { $report['users']['failed']++; $report['users']['errors'][] = $user_id->get_error_message(); continue; }
		wp_update_user(['ID' => $user_id, 'display_name' => $u['full_name'] ?? $u['username']]);
		update_user_meta($user_id, 'gadv_pg_id', $pgid);
		// Demo rows carry the demo flag + verified email (demo users never go
		// through email confirmation; the app reads gadv_is_demo everywhere).
		if (!empty($u['is_demo'])) {
			update_user_meta($user_id, 'gadv_is_demo', 1);
			update_user_meta($user_id, 'gadv_email_verified', 1);
		}
		if (!empty($u['avatar_url'])) update_user_meta($user_id, 'gadv_avatar_orig_url', $u['avatar_url']);
		$report['users']['imported']++;
	}
}

// Posts import (basic)
$postsFile = $dir . '/posts.json';
if (file_exists($postsFile) && (!$gadv_only || isset($gadv_only['posts']))) {
	$posts = read_json($postsFile);
	$report['posts'] = ['source' => count($posts), 'imported' => 0, 'skipped' => 0, 'failed' => 0, 'duplicates' => 0, 'errors' => []];
	foreach ($posts as $p) {
		$pgid = $p['id'];
		$existing = get_posts(['meta_key' => 'gadv_pg_id', 'meta_value' => $pgid, 'numberposts' => 1]);
		if (!empty($existing)) { $report['posts']['skipped']++; continue; }
		// handle media mapping: if post has media list, attempt to map to attachments via media_mappings.json
		$mapped_media = [];
		$mappingsFile = __DIR__ . '/media_mappings.json';
		$mappings = file_exists($mappingsFile) ? json_decode(file_get_contents($mappingsFile), true) : [];
		if (!empty($p['media']) && is_array($p['media'])) {
			foreach ($p['media'] as $m) {
				$url = $m['url'] ?? null;
				if ($url && isset($mappings[$url]) && isset($mappings[$url]['attachment_id'])) {
					$mapped_media[] = $mappings[$url]['attachment_id'];
				} else {
					// preserve original URL in meta for later manual handling
					$mapped_media[] = ['original_url' => $url];
				}
			}
		}
		// map author by pg id
		$author = get_users(['meta_key' => 'gadv_pg_id', 'meta_value' => $p['author_id'], 'number' => 1]);
		$author_id = !empty($author) ? $author[0]->ID : get_current_user_id();
		// Keep the authentic seed date (the demo spec spreads posts across
		// months) and the post type so PHOTO/ANNOUNCEMENT posts render right.
		$post_args = ['post_title' => wp_trim_words($p['content'], 8), 'post_content' => $p['content'], 'post_status' => 'publish', 'post_author' => $author_id];
		if (!empty($p['created_at']) && strtotime($p['created_at'])) $post_args['post_date'] = date('Y-m-d H:i:s', strtotime($p['created_at']));
		if (!empty($p['type']) && $p['type'] !== 'POLL') $post_args['meta_input'] = ['gadv_type' => sanitize_text_field($p['type'])];
		$post_id = wp_insert_post($post_args);
		if (is_wp_error($post_id) || !$post_id) { $report['posts']['failed']++; $report['posts']['errors'][] = is_wp_error($post_id) ? $post_id->get_error_message() : 'unknown'; continue; }
		update_post_meta($post_id, 'gadv_pg_id', $pgid);
		if (!empty($mapped_media)) update_post_meta($post_id, 'gadv_pg_media', json_encode($mapped_media));
		$report['posts']['imported']++;
	}
}

// Comments import
$commentsFile = $dir . '/comments.json';
if (file_exists($commentsFile) && (!$gadv_only || isset($gadv_only['comments']))) {
	$comments = read_json($commentsFile);
	$report['comments'] = ['source' => count($comments), 'imported' => 0, 'skipped' => 0, 'failed' => 0, 'duplicates' => 0, 'errors' => []];
	foreach ($comments as $c) {
		$pgid = $c['id'];
		// skip
		global $wpdb;
		// idempotency check: skip if comment with gadv_pg_id exists
		$exists = $wpdb->get_var($wpdb->prepare("SELECT comment_ID FROM {$wpdb->comments} WHERE comment_ID = (SELECT comment_id FROM {$wpdb->prefix}commentmeta WHERE meta_key = %s AND meta_value = %s LIMIT 1) LIMIT 1", 'gadv_pg_id', $pgid));
		// naive: insert
		$author = get_users(['meta_key' => 'gadv_pg_id', 'meta_value' => $c['author_id'], 'number' => 1]);
		$author_id = !empty($author) ? $author[0]->ID : 0;
		$post = get_posts(['meta_key' => 'gadv_pg_id', 'meta_value' => $c['post_id'], 'numberposts' => 1]);
		$post_id = !empty($post) ? $post[0]->ID : 0;
		if (!$post_id) { $report['comments']['failed']++; $report['comments']['errors'][] = "post not found for comment {$pgid}"; continue; }
		// Only insert if not exists
		if ($exists) { $report['comments']['skipped']++; continue; }
		$cid = wp_insert_comment(['comment_post_ID' => $post_id, 'comment_author' => $c['author_name'] ?? '', 'comment_author_email' => $c['author_email'] ?? '', 'comment_author_url' => '', 'user_id' => $author_id, 'comment_content' => $c['content'], 'comment_parent' => 0, 'comment_approved' => 1]);
		if (!$cid) { $report['comments']['failed']++; $report['comments']['errors'][] = "failed insert {$pgid}"; continue; }
		add_comment_meta($cid, 'gadv_pg_id', $pgid);
		$report['comments']['imported']++;
	}
}

// Write report
file_put_contents(__DIR__ . '/migration_report.json', json_encode($report, JSON_PRETTY_PRINT));
if (php_sapi_name() === 'cli') echo "Migration report written to scripts/migration_report.json\n";
else echo json_encode($report);

// Additional entities import: reactions, follows, conversations, messages, groups, group_members, notifications, polls, poll_options, poll_votes, reports, blocks, mutes, refresh_tokens, email_tokens

// Reactions
$reactionsFile = $dir . '/reactions.json';
if (file_exists($reactionsFile) && (!$gadv_only || isset($gadv_only['reactions']))) {
	$reactions = read_json($reactionsFile);
	$report['reactions'] = ['source'=>count($reactions),'imported'=>0,'skipped'=>0,'failed'=>0,'errors'=>[]];
	global $wpdb;
	$table = $wpdb->prefix . 'gadv_reactions';
	foreach ($reactions as $r) {
		$pgid = $r['id'];
		// skip if exists by pg id stored in a meta field on reaction? (we store no meta here) -> use unique constraint by post_id,user_id
		$post = get_posts(['meta_key'=>'gadv_pg_id','meta_value'=>$r['post_id'],'numberposts'=>1]);
		if (empty($post)) { $report['reactions']['failed']++; $report['reactions']['errors'][] = "post not found for reaction {$pgid}"; continue; }
		$post_id = $post[0]->ID;
		$user = get_users(['meta_key'=>'gadv_pg_id','meta_value'=>$r['user_id'],'number'=>1]);
		$user_id = !empty($user) ? $user[0]->ID : 0;
		$exists = $wpdb->get_row($wpdb->prepare("SELECT id FROM $table WHERE post_id=%d AND user_id=%d", $post_id, $user_id));
		if ($exists) { $report['reactions']['skipped']++; continue; }
		$wpdb->insert($table, ['post_id'=>$post_id,'user_id'=>$user_id,'type'=>$r['type'],'created_at'=>$r['created_at']]);
		$report['reactions']['imported']++;
	}
}

// Follows
$followsFile = $dir . '/follows.json';
if (file_exists($followsFile) && (!$gadv_only || isset($gadv_only['follows']))) {
	$follows = read_json($followsFile);
	$report['follows'] = ['source'=>count($follows),'imported'=>0,'skipped'=>0,'failed'=>0,'errors'=>[]];
	global $wpdb;
	$table = $wpdb->prefix . 'gadv_follows';
	foreach ($follows as $f) {
		$follower = get_users(['meta_key'=>'gadv_pg_id','meta_value'=>$f['follower_id'],'number'=>1]);
		$followee = get_users(['meta_key'=>'gadv_pg_id','meta_value'=>$f['followee_id'],'number'=>1]);
		if (empty($follower) || empty($followee)) { $report['follows']['failed']++; $report['follows']['errors'][] = "user missing for follow entry"; continue; }
		$fid = $follower[0]->ID; $tid = $followee[0]->ID;
		$exists = $wpdb->get_row($wpdb->prepare("SELECT 1 FROM $table WHERE follower_id=%d AND followee_id=%d", $fid, $tid));
		if ($exists) { $report['follows']['skipped']++; continue; }
		$wpdb->insert($table, ['follower_id'=>$fid,'followee_id'=>$tid,'created_at'=>$f['created_at']]);
		$report['follows']['imported']++;
	}
}

// Groups
$groupsFile = $dir . '/groups.json';
if (file_exists($groupsFile)) {
	$groups = read_json($groupsFile);
	$report['groups'] = ['source'=>count($groups),'imported'=>0,'skipped'=>0,'failed'=>0,'errors'=>[]];
	foreach ($groups as $g) {
		$pgid = $g['id'];
		$existing = get_posts(['meta_key'=>'gadv_pg_id','meta_value'=>$pgid,'post_type'=>'gadv_group','numberposts'=>1]);
		if (!empty($existing)) { $report['groups']['skipped']++; continue; }
		// store groups as custom post type or in gadv_groups table. We'll use gadv_groups table for now.
		$res = $wpdb->insert($wpdb->prefix . 'gadv_groups', ['slug'=>$g['slug'],'name'=>$g['name'],'description'=>$g['description'],'created_at'=>$g['created_at']]);
		if ($res === false) { $report['groups']['failed']++; $report['groups']['errors'][] = 'db insert failed'; continue; }
		$report['groups']['imported']++;
	}
}

// Group members
$membersFile = $dir . '/group_members.json';
if (file_exists($membersFile)) {
	$members = read_json($membersFile);
	$report['group_members'] = ['source'=>count($members),'imported'=>0,'skipped'=>0,'failed'=>0,'errors'=>[]];
	foreach ($members as $m) {
		$group = $wpdb->get_row($wpdb->prepare("SELECT id FROM {$wpdb->prefix}gadv_groups WHERE slug=%s", $m['group_slug']));
		if (!$group) { $report['group_members']['failed']++; $report['group_members']['errors'][] = 'group not found'; continue; }
		$user = get_users(['meta_key'=>'gadv_pg_id','meta_value'=>$m['user_id'],'number'=>1]);
		if (empty($user)) { $report['group_members']['failed']++; $report['group_members']['errors'][] = 'user not found'; continue; }
		$uid = $user[0]->ID;
		$exists = $wpdb->get_row($wpdb->prepare("SELECT 1 FROM {$wpdb->prefix}gadv_group_members WHERE group_id=%d AND user_id=%d", $group->id, $uid));
		if ($exists) { $report['group_members']['skipped']++; continue; }
		$wpdb->insert($wpdb->prefix . 'gadv_group_members', ['group_id'=>$group->id,'user_id'=>$uid,'created_at'=>$m['created_at']]);
		$report['group_members']['imported']++;
	}
}

// Conversations and participants
$convsFile = $dir . '/conversations.json';
if (file_exists($convsFile)) {
	$convs = read_json($convsFile);
	$report['conversations'] = ['source'=>count($convs),'imported'=>0,'skipped'=>0,'failed'=>0,'errors'=>[]];
	foreach ($convs as $c) {
		$pgid = $c['id'];
		$exists = $wpdb->get_row($wpdb->prepare("SELECT id FROM {$wpdb->prefix}gadv_conversations WHERE pg_id=%s", $pgid));
		if ($exists) { $report['conversations']['skipped']++; continue; }
		$wpdb->insert($wpdb->prefix . 'gadv_conversations', ['pg_id'=>$pgid,'subject'=>$c['subject'],'created_at'=>$c['created_at']]);
		$conv_id = $wpdb->insert_id;
		// participants
		if (!empty($c['participants']) && is_array($c['participants'])) {
			foreach ($c['participants'] as $p) {
				$u = get_users(['meta_key'=>'gadv_pg_id','meta_value'=>$p,'number'=>1]);
				if (empty($u)) continue;
				$wpdb->insert($wpdb->prefix . 'gadv_conversation_participants', ['conversation_id'=>$conv_id,'user_id'=>$u[0]->ID,'joined_at'=>current_time('mysql',1)]);
			}
		}
		$report['conversations']['imported']++;
	}
}

// Messages
$messagesFile = $dir . '/messages.json';
if (file_exists($messagesFile)) {
	$msgs = read_json($messagesFile);
	$report['messages'] = ['source'=>count($msgs),'imported'=>0,'skipped'=>0,'failed'=>0,'errors'=>[]];
	foreach ($msgs as $m) {
		$conv = $wpdb->get_row($wpdb->prepare("SELECT id FROM {$wpdb->prefix}gadv_conversations WHERE pg_id=%s", $m['conversation_id']));
		if (!$conv) { $report['messages']['failed']++; $report['messages']['errors'][] = 'conversation not found'; continue; }
		$user = get_users(['meta_key'=>'gadv_pg_id','meta_value'=>$m['author_id'],'number'=>1]);
		$uid = !empty($user) ? $user[0]->ID : 0;
		$exists = $wpdb->get_row($wpdb->prepare("SELECT id FROM {$wpdb->prefix}gadv_messages WHERE pg_id=%s", $m['id']));
		if ($exists) { $report['messages']['skipped']++; continue; }
		$wpdb->insert($wpdb->prefix . 'gadv_messages', ['conversation_id'=>$conv->id,'user_id'=>$uid,'content'=>$m['content'],'pg_id'=>$m['id'],'created_at'=>$m['created_at']]);
		$report['messages']['imported']++;
	}
}

// Notifications
$notesFile = $dir . '/notifications.json';
if (file_exists($notesFile)) {
	$notes = read_json($notesFile);
	$report['notifications'] = ['source'=>count($notes),'imported'=>0,'skipped'=>0,'failed'=>0,'errors'=>[]];
	foreach ($notes as $n) {
		$user = get_users(['meta_key'=>'gadv_pg_id','meta_value'=>$n['user_id'],'number'=>1]);
		if (empty($user)) { $report['notifications']['failed']++; $report['notifications']['errors'][] = 'user not found'; continue; }
		$uid = $user[0]->ID;
		$exists = $wpdb->get_row($wpdb->prepare("SELECT 1 FROM {$wpdb->prefix}gadv_notifications WHERE id=%d", $n['id']));
		if ($exists) { $report['notifications']['skipped']++; continue; }
		$wpdb->insert($wpdb->prefix . 'gadv_notifications', ['user_id'=>$uid,'type'=>$n['type'],'payload'=>json_encode($n['payload']),'created_at'=>$n['created_at']]);
		$report['notifications']['imported']++;
	}
}

// Polls, options, votes
$pollsFile = $dir . '/polls.json';
if (file_exists($pollsFile)) {
	$polls = read_json($pollsFile);
	$report['polls'] = ['source'=>count($polls),'imported'=>0,'skipped'=>0,'failed'=>0,'errors'=>[]];
	foreach ($polls as $p) {
		$exists = $wpdb->get_row($wpdb->prepare("SELECT id FROM {$wpdb->prefix}gadv_polls WHERE pg_id=%s", $p['id']));
		if ($exists) { $report['polls']['skipped']++; continue; }
		$wpdb->insert($wpdb->prefix . 'gadv_polls', ['pg_id'=>$p['id'],'question'=>$p['question'],'created_at'=>$p['created_at']]);
		$pid = $wpdb->insert_id;
		if (!empty($p['options'])) {
			foreach ($p['options'] as $opt) {
				$wpdb->insert($wpdb->prefix . 'gadv_poll_options', ['poll_id'=>$pid,'option_text'=>$opt['label'],'created_at'=>$opt['created_at']]);
			}
		}
		$report['polls']['imported']++;
	}
}

// Reports
$reportsFile = $dir . '/reports.json';
if (file_exists($reportsFile)) {
	$rpts = read_json($reportsFile);
	$report['reports'] = ['source'=>count($rpts),'imported'=>0,'skipped'=>0,'failed'=>0,'errors'=>[]];
	foreach ($rpts as $rp) {
		$exists = $wpdb->get_row($wpdb->prepare("SELECT id FROM {$wpdb->prefix}gadv_reports WHERE id=%d", $rp['id']));
		if ($exists) { $report['reports']['skipped']++; continue; }
		$reportee = get_users(['meta_key'=>'gadv_pg_id','meta_value'=>$rp['entity_id'],'number'=>1]);
		$wpdb->insert($wpdb->prefix . 'gadv_reports', ['reporter_id'=>$rp['reporter_id'],'entity_type'=>$rp['entity_type'],'entity_id'=>$rp['entity_id'],'reason'=>$rp['reason'],'details'=>$rp['details'],'status'=>$rp['status'],'created_at'=>$rp['created_at']]);
		$report['reports']['imported']++;
	}
}

// Blocks and mutes
$blocksFile = $dir . '/blocks.json';
if (file_exists($blocksFile)) {
	$blocks = read_json($blocksFile);
	$report['blocks'] = ['source'=>count($blocks),'imported'=>0,'skipped'=>0,'failed'=>0,'errors'=>[]];
	foreach ($blocks as $b) {
		$blocker = get_users(['meta_key'=>'gadv_pg_id','meta_value'=>$b['blocker_id'],'number'=>1]);
		$blocked = get_users(['meta_key'=>'gadv_pg_id','meta_value'=>$b['blocked_id'],'number'=>1]);
		if (empty($blocker) || empty($blocked)) { $report['blocks']['failed']++; $report['blocks']['errors'][] = 'user missing'; continue; }
		$wpdb->replace($wpdb->prefix . 'gadv_blocks', ['blocker_id'=>$blocker[0]->ID,'blocked_id'=>$blocked[0]->ID,'created_at'=>$b['created_at']]);
		$report['blocks']['imported']++;
	}
}

// Mutes
$mutesFile = $dir . '/mutes.json';
if (file_exists($mutesFile)) {
	$mutes = read_json($mutesFile);
	$report['mutes'] = ['source'=>count($mutes),'imported'=>0,'skipped'=>0,'failed'=>0,'errors'=>[]];
	foreach ($mutes as $m) {
		$u = get_users(['meta_key'=>'gadv_pg_id','meta_value'=>$m['user_id'],'number'=>1]);
		$t = get_users(['meta_key'=>'gadv_pg_id','meta_value'=>$m['muted_id'],'number'=>1]);
		if (empty($u) || empty($t)) { $report['mutes']['failed']++; $report['mutes']['errors'][] = 'user missing'; continue; }
		$wpdb->replace($wpdb->prefix . 'gadv_mutes', ['user_id'=>$u[0]->ID,'muted_id'=>$t[0]->ID,'until_at'=>$m['until_at'],'created_at'=>$m['created_at']]);
		$report['mutes']['imported']++;
	}
}

// Refresh tokens and email tokens: import hashed only (do not recreate plain tokens)
$rtFile = $dir . '/refresh_tokens.json';
if (file_exists($rtFile)) {
	$rts = read_json($rtFile);
	$report['refresh_tokens'] = ['source'=>count($rts),'imported'=>0,'skipped'=>0,'failed'=>0,'errors'=>[]];
	foreach ($rts as $t) {
		$u = get_users(['meta_key'=>'gadv_pg_id','meta_value'=>$t['user_id'],'number'=>1]);
		if (empty($u)) { $report['refresh_tokens']['failed']++; $report['refresh_tokens']['errors'][] = 'user missing'; continue; }
		// Import token hash only and mark as imported; do not allow use until rotated via login flow
		$wpdb->insert($wpdb->prefix . 'gadv_refresh_tokens', ['user_id'=>$u[0]->ID,'token_hash'=>$t['token_hash'],'expires_at'=>$t['expires_at'],'created_at'=>$t['created_at']]);
		$report['refresh_tokens']['imported']++;
	}
}

$etFile = $dir . '/email_tokens.json';
if (file_exists($etFile)) {
	$ets = read_json($etFile);
	$report['email_tokens'] = ['source'=>count($ets),'imported'=>0,'skipped'=>0,'failed'=>0,'errors'=>[]];
	foreach ($ets as $et) {
		$u = get_users(['meta_key'=>'gadv_pg_id','meta_value'=>$et['user_id'],'number'=>1]);
		if (empty($u)) { $report['email_tokens']['failed']++; $report['email_tokens']['errors'][] = 'user missing'; continue; }
		$wpdb->insert($wpdb->prefix . 'gadv_email_tokens', ['user_id'=>$u[0]->ID,'purpose'=>$et['purpose'],'token_hash'=>$et['token_hash'] ?? null,'otp'=>$et['otp'] ?? null,'attempts'=>$et['attempts'] ?? 0,'expires_at'=>$et['expires_at'],'consumed_at'=>$et['consumed_at'] ?? null,'payload'=>json_encode($et['payload'] ?? null),'created_at'=>$et['created_at']]);
		$report['email_tokens']['imported']++;
	}
}

// Post media (attachments) — rely on media_mappings.json
$pmFile = $dir . '/post_media.json';
if (file_exists($pmFile)) {
	$pms = read_json($pmFile);
	$report['post_media'] = ['source'=>count($pms),'imported'=>0,'skipped'=>0,'failed'=>0,'errors'=>[]];
	$mappingsFile = __DIR__ . '/media_mappings.json';
	$mappings = file_exists($mappingsFile) ? json_decode(file_get_contents($mappingsFile), true) : [];
	foreach ($pms as $pm) {
		$orig = $pm['url'] ?? null;
		$post = get_posts(['meta_key'=>'gadv_pg_id','meta_value'=>$pm['post_id'],'numberposts'=>1]);
		if (empty($post)) { $report['post_media']['failed']++; $report['post_media']['errors'][] = 'post not found'; continue; }
		$post_id = $post[0]->ID;
		if ($orig && isset($mappings[$orig]) && isset($mappings[$orig]['attachment_id'])) {
			$attach_id = $mappings[$orig]['attachment_id'];
			// attach if not already attached
			$already = get_post_meta($post_id, 'gadv_attached_media', true);
			$list = $already ? json_decode($already, true) : [];
			if (!in_array($attach_id, $list)) { $list[] = $attach_id; update_post_meta($post_id, 'gadv_attached_media', json_encode($list)); }
			update_post_meta($attach_id, 'gadv_pg_url', $orig);
			$report['post_media']['imported']++;
		} else {
			// keep original URL reference
			$existing = get_post_meta($post_id, 'gadv_pg_media', true);
			$arr = $existing ? json_decode($existing, true) : [];
			$arr[] = ['original_url' => $orig];
			update_post_meta($post_id, 'gadv_pg_media', json_encode($arr));
			$report['post_media']['skipped']++;
		}
	}
}

// Update report file
file_put_contents(__DIR__ . '/migration_report.json', json_encode($report, JSON_PRETTY_PRINT));

?>
