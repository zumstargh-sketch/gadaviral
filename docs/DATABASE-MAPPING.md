# Database mapping: PostgreSQL → WordPress

This mapping describes how the existing PostgreSQL schema (used by the local Express backend)
is mapped to WordPress tables and gadv_ custom tables.

Core mappings:

- users (Postgres) -> wp_users + wp_usermeta
  - password_hash -> WP-managed password (wp_hash_password)
  - email_verified -> usermeta key `gadv_email_verified`
  - username -> user_login
  - full_name -> display_name
  - profile fields -> wp_usermeta keys (gadv_location, gadv_hometown, gadv_is_demo, seed_batch)

- profiles -> wp_usermeta (avatar_url stored as usermeta `gadv_avatar_url` or WordPress avatar)

- posts -> wp_posts (post_content, post_title, post_date) + postmeta for extra fields (gadv_type, gadv_visibility, seed_batch, is_demo)

- post_media -> wp_posts attachments + postmeta (gadv_media_position, gadv_media_type)

- reactions -> gadv_reactions (custom table)

- comments -> wp_comments

- shares -> wp_posts with post_type 'share' OR postmeta depending on structure (migration script will preserve original relationships)

- views -> gadv_post_views (custom table)

- follows -> gadv_follows (custom table)

- notifications -> gadv_notifications (custom table)

- conversations/messages -> gadv_conversations, gadv_messages (custom tables)

- groups/pages -> gadv_groups, gadv_group_members (custom tables) or CPTs if preferred

- polls -> gadv_polls, gadv_poll_options, gadv_poll_votes (custom tables)

Notes:
- All custom tables created by the plugin use the WordPress table prefix and are created via dbDelta.
- Migration of IDs: migration preserves original IDs where safe and maps them to WordPress IDs in a mapping file to maintain relationships.
