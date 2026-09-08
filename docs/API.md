# API Reference

Base URL: `/api/v1` · Interactive docs: **`/api/docs`** (Swagger UI, full OpenAPI spec) · Health: `GET /api/v1/health`

Authentication: `Authorization: Bearer <accessToken>` (15-min JWT).
Refresh: `POST /auth/refresh` (reads the HttpOnly refresh cookie set at login — web) or `{ refreshToken }` body (apps). Refresh tokens rotate single-use.

## Auth
| Method | Path | Description |
|---|---|---|
| POST | `/auth/register` | `{email, password, fullName, username?}` → send verification |
| POST | `/auth/login` | `{email, password}` → `{user, accessToken}` + refresh cookie |
| POST | `/auth/refresh` | rotate refresh → new access token |
| POST | `/auth/logout` | revoke current refresh token |
| GET | `/auth/verify?token=` | verify email (single-use link) |
| POST | `/auth/verify-otp` | `{email, otp}` 6-digit verification |
| POST | `/auth/resend-verification` | `{email}` (60 s cooldown, rate limited) |
| POST | `/auth/forgot-password` | `{email}` (anti-enumeration) |
| POST | `/auth/reset-password` | `{token, password}` — revokes all sessions |
| POST | `/auth/change-password` | auth; `{currentPassword, newPassword}` |
| POST | `/auth/change-email/start` | auth; `{currentPassword, newEmail}` → proof email |
| GET | `/auth/change-email/confirm?token=` | complete change |
| GET | `/auth/google/url` | web OAuth start (signed state) |
| GET | `/auth/google/callback` | Google redirect → session |
| POST | `/auth/google/idtoken` | `{idToken, platform}` Android/Windows flow |
| GET | `/auth/sessions` · DELETE `/auth/sessions/:id` | list/revoke sessions |
| GET | `/auth/audit` | own security log |
| DELETE | `/auth/account` | deactivate own account |

## Users & social graph
`GET /users/me` · `PATCH /users/me` · `GET /users/:username` · `GET /users/:username/posts`
`POST /users/me/avatar` · `POST /users/me/cover` (multipart)
`POST /users/:id/follow` · `DELETE /users/:id/follow` · `GET /users/:id/followers|following`
`POST /users/:id/block` · `DELETE /users/:id/block` · `POST /users/:id/mute`

## Posts & engagement
`GET /posts/feed?cursor&limit&filter=recent|following|trending` (cursor pagination, infinite scroll)
`POST /posts` — `{content, visibility?, mediaIds?, poll?}` (moderation pipeline)
`GET /posts/:id` · `DELETE /posts/:id`
`POST /posts/:id/react` — `{type: LIKE|LOVE|HAHA|WOW|SAD|CELEBRATE}` (unique per user+post, switch/remove)
`GET /posts/:id/comments?cursor` · `POST /posts/:id/comments` · `PATCH/DELETE /comments/:id` · `POST /comments/:id/replies`
`POST /posts/:id/share` — `{caption?}` real share records + notification
`POST /polls/:postId/vote` — `{optionId}` (switch allowed, one vote per user)

## Media
`POST /media/upload` (multipart, ≤25 MB, MIME-checked) → `{id, url, width, height, thumbnailUrl}`

## Groups · Events · Pages · Businesses
`GET/POST /groups` · `GET /groups/:id` · `POST /groups/:id/join` · `DELETE …/join` · `GET /groups/:id/members` · `POST /groups/:id/posts`
`GET/POST /events` · `GET /events/:id` · `POST /events/:id/rsvp` `{status: ATTENDING|INTERESTED}` · `GET /events/:id/attendees`
`GET/POST /pages` · `POST /pages/:id/follow`
`GET/POST /businesses` · `GET /businesses/:id` · `PATCH /businesses/:id`

## Notifications · Messaging · Search
`GET /notifications?cursor` · `POST /notifications/read` (mark all) · `POST /notifications/:id/read`
`GET /conversations` · `POST /conversations` `{recipientId}` · `GET /conversations/:id/messages?cursor` · `POST …/messages` (realtime via Socket.IO + persisted)
`GET /search?q&type=users|posts|groups|pages|businesses|events` (indexed ILIKE + trigram)

## Moderation · Reports · Admin
`POST /reports` — `{targetType, targetId, category, details?}`
`GET /moderation/queue` (mod+) — reports + flagged content
`POST /moderation/reports/:id/handle` `{action: RESOLVED|DISMISSED|REVIEWING, removeTarget}`
`POST /moderation/posts/:id/remove|restore`
`GET /admin/analytics` (admin+) — totals, new-7d, active-24h
`GET /admin/users?q` · `POST /admin/users/:id/status` `{status, reason?}` · `POST /admin/users/:id/verify` · `POST /admin/users/:id/role` (super admin)
`GET /admin/audit-logs`
`GET /admin/demo/stats` · `GET /admin/demo/verify` · `POST /admin/demo/seed` `{force}` · `POST /admin/demo/wipe`

## Realtime (Socket.IO)
`connect` with `Authorization` header → joins personal room: events
`notification:new`, `message:new`, `conversation:read`, `presence:online`.

## Errors
`{ "error": { "code": "MACHINE_CODE", "message": "human readable" } }` with proper HTTP status
(400 validation · 401 unauthenticated · 403 forbidden/roles · 404 · 409 duplicates · 422 moderation REJECTED · 429 rate limit).
