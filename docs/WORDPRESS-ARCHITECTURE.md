# GADAVIRAL WordPress Architecture

This document describes the WordPress-based production architecture used to host the GADAVIRAL backend and database.

Key principles:
- Use native WordPress tables where possible (wp_users, wp_posts, wp_comments, wp_postmeta, wp_usermeta).
- Use dedicated `gadv_` custom tables for high-volume relational data (reactions, follows, notifications, conversations, messages, groups, polls, reports).
- Non-destructive: plugin activation creates tables only if missing and never drops or truncates existing tables.
- The frontend communicates with WordPress via REST routes under `/wp-json/gad/v1/`.

Plugin location: `wordpress/gadaviral-api/`

Main responsibilities:
- Authentication endpoints (login/register/refresh)
- User/profile endpoints
- Posts/feed endpoints (wp_posts)
- Comments (wp_comments)
- Reactions, follows, notifications (custom tables)
- Messaging (conversations/messages custom tables)
- Groups and polls (custom tables)
- Search (users + posts)
