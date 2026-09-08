# Migration guide (PostgreSQL → WordPress)

This guide explains how to export existing PostgreSQL data from the current Express/Postgres backend and import it into WordPress with the GADAVIRAL API plugin.

Overview steps:
1. Export PostgreSQL tables to JSON files (users, profiles, posts, post_media, reactions, comments, shares, follows, notifications, conversations, messages, groups, polls, poll_options, poll_votes).
2. Run transformation script to convert JSON into WordPress-compatible payloads (preserve IDs mapping where possible).
3. Run WP-CLI import scripts (or REST-based importer) to create users, posts, attachments, comments, and populate gadv_ custom tables.
4. Verify counts and run the compatibility audit.

Important safety notes:
- Do not modify or delete any PostgreSQL data during export.
- The import script is additive and will skip existing records based on unique keys (email for users, post GUIDs, etc.).
- Back up your WordPress production database before importing.

Tools included in this repo:
- scripts/export_postgres.sql — SQL queries to export main tables (use psql COPY TO for CSV/JSON)
- scripts/pg_export.js — Node script (example) to export tables to JSON using connection string
- scripts/wp_importer.php — Example WP-CLI compatible PHP importer that reads JSON and creates WP entities

Runbook (example):

1. Export from Postgres:

   psql "$DATABASE_URL" -f scripts/export_postgres.sql -o exports/raw_export.json

2. Transform (local):

   node scripts/transform_export.js exports/raw_export.json exports/transformed/

3. Import into WordPress (on server):

   wp plugin activate gadaviral-api
   wp eval-file scripts/wp_importer.php -- path=exports/transformed/

4. Verify:

   wp eval "echo json_encode(gadv_migration_report());"

The included scripts are templates and must be reviewed before running in production.
