Postgres table -> WordPress destination mapping (working document)

users
  -> wp_users (wp_user_meta 'gadv_pg_id')
  transformation: preserve email, username, display_name; password replaced by generated password; record original pg uuid in usermeta
  relationships: profiles -> usermeta; auth_identities -> wp_usermeta (or gadv_auth_identities table)
  id strategy: store pg uuid in usermeta 'gadv_pg_id'

profiles
  -> wp_usermeta keys: gadv_avatar_orig_url, gadv_cover_orig_url, gadv_bio, gadv_location, gadv_interests

posts
  -> wp_posts (postmeta 'gadv_pg_id')
  transformation: content -> post_content, created_at -> post_date_gmt, title optional
  media: post_media -> use media_mappings.json and attach to post
  id strategy: store pg id in postmeta

post_media
  -> wp_posts attachments + postmeta 'gadv_pg_media' on post stores attachment ids
  transformation: download original URL, import as attachment, set attachment metadata, store original URL in attachment meta 'gadv_pg_url'

comments
  -> wp_comments (commentmeta 'gadv_pg_id')

reactions
  -> {$wpdb->prefix}gadv_reactions table (map post_id->post meta gadv_pg_id -> wp post id)
  transformation: map reaction types; preserve created_at

follows
  -> {$wpdb->prefix}gadv_follows
  transformation: follower_id/followee_id mapped from usermeta gadv_pg_id -> wp user id

conversations
  -> {$wpdb->prefix}gadv_conversations
  participants -> gadv_conversation_participants
  messages -> gadv_messages (map author ids)

groups
  -> {$wpdb->prefix}gadv_groups
  members -> {$wpdb->prefix}gadv_group_members

notifications
  -> {$wpdb->prefix}gadv_notifications (map user ids)

polls
  -> {$wpdb->prefix}gadv_polls, gadv_poll_options, gadv_poll_votes

reports
  -> {$wpdb->prefix}gadv_reports

blocks
  -> {$wpdb->prefix}gadv_blocks

mutes
  -> {$wpdb->prefix}gadv_mutes

refresh_tokens
  -> {$wpdb->prefix}gadv_refresh_tokens (store token hashes only; don't import plaintext tokens)

email_tokens
  -> {$wpdb->prefix}gadv_email_tokens


General migration order (high-level)
1. users
2. profiles
3. groups
4. conversations (create conversations & participants)
5. posts
6. post_media (attachments)
7. comments
8. reactions
9. follows
10. messages
11. notifications
12. reports
13. polls + votes
14. refresh_tokens / email_tokens (import hashed tokens only)

Idempotency strategy
- For each created WP object, write original pg id into meta e.g. 'gadv_pg_id'
- Before creating a WP object, check for existing object with that meta key and skip if present
- For tokens where plaintext tokens cannot be migrated, import hashed values and mark as not usable for client; report for manual reconciliation

Media strategy
- Attempt to download original URL and import into WP media library
- Record mapping in scripts/media_mappings.json
- If download fails, record error and leave post referencing original URL in postmeta for manual review

Reports
- Produce scripts/migration_report.json with counts for each entity
- Also produce scripts/media_mappings.json
