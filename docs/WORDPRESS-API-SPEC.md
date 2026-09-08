# GADAVIRAL — WordPress REST API Specification (`gadaviral/v1`)

**What the Code Snippets API must provide so the React app (`web/`) works unchanged.**

Source of truth: every request actually made by `web/src/**` (full source audit, 2026-09-08).
The frontend already targets `https://www.gadaviral.com/wp-json/gadaviral/v1/` (same origin as the
app at `/app/`). Implement the routes below and the app connects with **no further frontend
changes** — except the optional realtime polling described in §8, which I can wire up afterwards.

Currently live: only `GET /gadaviral/v1/health`. Everything below is what is still missing.

---

## 0. Conventions (all routes)

- **Namespace / registration:** `'gadaviral/v1'` inside `add_action('rest_api_init', …)`.
- **Auth header:** `Authorization: Bearer <accessToken>` on every authenticated call.
- **JSON bodies:** the app sends `Content-Type: application/json` → read with
  `$request->get_json_params()`. **Uploads** are `multipart/form-data` → `$request->get_file_params()`.
- **Error shape:** standard `WP_Error( 'machine_code', 'Human readable message', [ 'status' => 4xx ] )`
  → `{ "code", "message", "data": { "status" } }`. The frontend prints `message` verbatim and
  understands 401 (one silent refresh retry, then logout), 403, 404, 409, 422, 429, 500.
- **Timestamps:** ISO-8601 (`date('c')`). **IDs:** opaque strings. **Media URLs:** absolute
  (`https://www.gadaviral.com/...`) or root-relative — the app renders them as-is.
- **Response fields are snake_case** (e.g. `full_name`, `avatar_url`). A few REQUEST bodies are
  camelCase — flagged in the tables (`fullName`, `ethnicGroup`, `startsAt`, …).
- **CORS:** nothing needed — same origin. **Do NOT let LiteSpeed cache `/wp-json/*`** (at minimum
  exclude `gadaviral/v1`), otherwise stale/authenticated responses will be served to the wrong user.
- **`permission_callback` is mandatory on every route.** Public → `__return_true`; authenticated →
  validate the Bearer token; moderation queue → MODERATOR/ADMIN/SUPER_ADMIN; admin/* → ADMIN/SUPER_ADMIN.
- Roles the UI checks: `MODERATOR`, `ADMIN`, `SUPER_ADMIN` (user.role).

---

## 1. Auth (13 routes)

**Contract the frontend depends on:** login / register / refresh return **top-level**
`accessToken` and `refreshToken`. An expired access token (401) makes the app call refresh
**once** (`POST /auth/refresh` with `{ "refreshToken": "..." }`); if that fails it clears
`gadv_access` / `gadv_refresh` from localStorage and logs out. Rotate refresh tokens single-use
to keep this loop-free.

| Method | Path | Body (JSON) | Response (JSON) |
|---|---|---|---|
| POST | `/auth/register` | `{ "fullName", "email", "password", "username"? }` | any success payload; UI then navigates to `/verify?email=…` and expects a 6-digit OTP email |
| POST | `/auth/login` | `{ "email", "password" }` | `{ "accessToken", "refreshToken", "user"? }` |
| POST | `/auth/refresh` | `{ "refreshToken" }` | `{ "accessToken", "refreshToken", "user"? }` |
| POST | `/auth/logout` | `{}` | any success; app clears tokens locally regardless |
| GET | `/auth/me` | — | `{ "user": User, "profile": Profile }` (shapes in §2) |
| POST | `/auth/verify-otp` | `{ "email", "otp" }` | success → app calls `/auth/me` |
| POST | `/auth/resend-verification` | `{ "email" }` | `{ "message": "…" }` (60s cooldown → 429 with a message containing "wait") |
| POST | `/auth/forgot-password` | `{ "email" }` | success (anti-enumeration) |
| POST | `/auth/reset-password` | `{ "token", "password" }` | success |
| POST | `/auth/change-password` | `{ "currentPassword", "newPassword" }` | `{ "message": "…" }` |
| POST | `/auth/change-email` | `{ "newEmail", "currentPassword" }` | `{ "message": "…" }` |
| GET | `/auth/google/url` | — | `{ "url": "https://accounts.google.com/..." }` |
| GET | `/auth/google/callback` | — (Google redirect) | server-side: exchange code, then **302 redirect** to the SPA (see below) |

**Google OAuth redirect target (important):** the browser must land on
`https://www.gadaviral.com/app/auth/google/complete` with query params
`accessToken`, `isNew` (`true|false`), `needsProfile` (`true|false`).
The app stores the token and navigates to `/settings?welcome=1` or `/feed`.

**Email link targets:** verification link/button → `https://www.gadaviral.com/app/verified?email=…`;
password reset → `https://www.gadaviral.com/app/reset-password?token=…`.
Sender shown in the UI: `GADAVIRAL (admin@gadaviral.com)`.

**Optional dev-only:** `GET /dev/outbox?email=…` → `{ "emails": [ { "otp": "123456" }, … ] }`.
The app self-404s this in production (it only surfaces a hint when the route exists).

## 2. Users, social graph, reports (12 routes)

**`User`** fields the UI reads: `id, username, full_name, email, email_verified, role,
avatar_url, cover_url, bio, is_demo` and (profile block on /auth/me + GET /users/:username):
`location, hometown, community, ethnic_group, occupation, education, gender,
date_of_birth (ISO), interests (string[]), languages (string[]), posts_count,
follower_count, following_count`.

**`Profile`** (GET /auth/me) carries the profile-only subset above (`bio … languages`).

| Method | Path | Body / notes | Response |
|---|---|---|---|
| PATCH | `/users/me` | camelCase: `{ "fullName", "bio", "location", "hometown", "community", "ethnicGroup"?, "occupation", "education", "gender"?, "dateOfBirth"?, "interests": string[], "languages": string[] }` | success |
| POST | `/users/me/avatar` | **FormData**, file field **`image`** | success |
| POST | `/users/me/cover` | **FormData**, file field **`image`** | success |
| GET | `/users/me/blocks` | — | `{ "items": [ { "id", "username", "full_name" } ] }` |
| POST | `/users/me/deactivate` | `{}` | success (app logs out + redirects) |
| GET | `/users/{username}` | — | `{ "user": User, "viewer": { "following": bool, "blocked": bool } }` |
| POST / DELETE | `/users/{username}/follow` | `{}` | success |
| POST / DELETE | `/users/{username}/block` | `{}` | success |
| POST | `/users/{username}/mute` | `{}` | success |
| POST | `/reports` | `{ "targetType": "USER", "targetId", "category": "OTHER", "details"? }` | success |

---

## 3. Posts, reactions, comments, shares, polls (11 routes)

**`Post`** fields the UI reads: `id, type (TEXT|PHOTO|POLL|ANNOUNCEMENT), content, created_at,
author_name, author_username, author_avatar, author_is_demo?, is_demo?, reaction_count,
comment_count, share_count, view_count, viewer: { reaction: "LIKE"|…|null },
media?: [ { id, media_type: "VIDEO"|<image>, url, alt_text? } ],
poll?: { question, totalVotes, options: [ { id, label, votes } ] },
sharedPost?: { author_username, content } }`. (`is_demo` / `author_is_demo` / `seed_note`
are optional cosmetic "DEMO" badges — safe to omit.)

| Method | Path | Body / notes | Response |
|---|---|---|---|
| GET | `/posts?feed=recent\|following\|recommended&page=N&limit=10` | feed list | `{ "items": Post[], "meta": { "totalPages": N } }` — infinite scroll pages on `meta.totalPages` |
| GET | `/posts?username={username}&limit=20` | profile wall | same shape |
| GET | `/posts?groupId={id}&limit=20` | group wall | same shape |
| POST | `/posts` | `{ "type", "content", "visibility": "PUBLIC"\|"FOLLOWERS"\|"PRIVATE", "poll"?: { "question", "options": string[] } }` | success |
| POST | `/posts/media` | **FormData**: `content`, `visibility`, plus up to 6 files under field **`media`** (images / mp4 / webm) | success |
| GET | `/posts/{id}` | — | `{ "post": Post }` |
| PUT | `/posts/{id}/react` | `{ "type": "LIKE"\|"LOVE"\|"CELEBRATE"\|"HAHA"\|"WOW"\|"SAD"\|"PROUD" }` | success (unique per user+post; same type again = remove/switch) |
| POST | `/posts/{id}/vote` | `{ "optionId" }` | success (one vote per user, switching allowed) |
| POST | `/posts/{id}/share` | `{ "target": "PROFILE" }` | success |
| GET | `/posts/{id}/comments?limit=50` | — | `{ "items": Comment[] }` — `Comment`: `{ id, content, created_at, author_name, author_username, author_avatar, reply_count, replies?: Comment[] }` |
| POST | `/posts/{id}/comments` | `{ "content", "parentCommentId"? }` | success |
| GET | `/posts/comments/{commentId}/replies` | — | `{ "items": Comment[] }` |

---

## 4. Community strip (public, 1 route)

| Method | Path | Body | Response |
|---|---|---|---|
| GET | `/community/highlights` | — (public, also called from `index.html` before login) | `{ "items": [ { "username", "full_name", "avatar_url", "location"?, "ethnic_group"? } ], "total": N }` |

The UI renders nothing while this 404s — safe to implement last.

## 5. Search, notifications, messaging (7 routes)

| Method | Path | Body / notes | Response |
|---|---|---|---|
| GET | `/search?q=&type=all\|users\|posts\|groups\|businesses\|events` | — | `{ "query", "users": [ { id, username, full_name, avatar_url, is_demo?, follower_count } ], "posts": [ { id, content, author_name, author_username } ], "groups": [ { id, slug, name, member_count } ], "businesses": [ { id, name, verified?, category, area? } ], "events": [ { id, title, starts_at } ] }` (empty arrays when a type has no hits) |
| GET | `/notifications?limit=50` | — | `{ "items": Notification[], "unreadCount": N }` — `Notification`: `{ id, type: "REACTION"\|"COMMENT"\|"REPLY"\|"SHARE"\|"FOLLOW"\|"MESSAGE"\|"EVENT"\|"GROUP"\|"MODERATION"\|"SYSTEM", body?, actor_username?, actor_name?, actor_avatar?, entity_type? ("post"), entity_id?, read_at?, created_at }` |
| POST | `/notifications/read` | `{}` | success — marks **all** read |
| GET | `/messages/conversations` | — | `{ "items": [ { "id", "other_name", "other_username", "other_avatar", "unread": N, "last_message"? } ] }` |
| POST | `/messages/conversations` | `{ "username" }` (without @) | `{ "conversationId": "..." }` |
| GET | `/messages/conversations/{id}?limit=100` | — | `{ "items": [ { "id", "content", "created_at", "sender_username", "is_mine": bool, "conversation_id" } ] }` |
| POST | `/messages/conversations/{id}` | `{ "content" }` | success (app reloads the thread) |

---

## 6. Groups, events, businesses (10 routes)

| Method | Path | Body / notes | Response |
|---|---|---|---|
| GET | `/groups?q=&limit=30` | — | `{ "items": [ { id, slug, name, description, member_count, privacy, joined: bool, is_demo? } ] }` |
| POST | `/groups` | `{ "name", "description" }` | success |
| GET | `/groups/{slug}` | — | `{ "group": <item above + creator_username?> }` |
| POST | `/groups/{slug}/join` | `{}` | success |
| POST | `/groups/{slug}/leave` | `{}` | success |
| GET | `/events?limit=30` | — | `{ "items": [ { id, slug, title, description?, location, community?, starts_at, going_count, interested_count, my_rsvp: "GOING"\|"INTERESTED"\|null, seed_note? } ] }` |
| POST | `/events` | camelCase: `{ "title", "description", "location", "startsAt": ISO }` | success |
| POST | `/events/{slug}/rsvp` | `{ "rsvp": "GOING"\|"INTERESTED"\|"NONE" }` | success |
| GET | `/businesses?q=&category=&limit=30` | categories: RESTAURANT, FASHION, FOOD_VENDOR, EVENT_SERVICES, PHOTOGRAPHY, TRANSPORT, PROFESSIONAL, ARTISAN, TOURISM, CATERING, DIGITAL, LOCAL_SHOP | `{ "items": [ { id, name, category, description, area?, phone?, verified?, is_demo? } ] }` |
| POST | `/businesses` | `{ "name", "category", "description", "area", "phone" }` | success |

## 7. Moderation & admin (13 routes — role-gated)

| Method | Path | Body / notes | Response |
|---|---|---|---|
| GET | `/moderation/queue` | MOD+ | `{ "items": [ { id, category, target_type, reporter_username, details? } ], "flaggedPosts": [ { id, author_username, created_at, content } ] }` |
| POST | `/moderation/reports/{id}/handle` | `{ "action": "REVIEWING"\|"RESOLVED"\|"DISMISSED", "removeTarget": bool, "note" }` | success |
| POST | `/moderation/posts/{id}/remove` | `{}` | success |
| POST | `/moderation/posts/{id}/restore` | `{}` | success |
| GET | `/admin/analytics` | admin+ | `{ "totals": { users, new_users_7d, posts, comments, reactions, shares, views, groups, events, businesses, messages }, "activeLast24h" }` (numbers) |
| GET | `/admin/users?q=&limit=30` | admin+ | `{ "items": [ { id, full_name, username, email, role, status, created_at, email_verified, is_demo? } ] }` |
| POST | `/admin/users/{id}/status` | `{ "status": "ACTIVE"\|"SUSPENDED"\|"BANNED", "reason"? }` | success |
| POST | `/admin/users/{id}/verify` | `{}` | success |
| GET | `/admin/audit-logs?limit=50` | admin+ | `{ "items": [ { id, created_at, actor_username?, action, entity_type, entity_id? } ] }` |
| GET | `/admin/demo/stats` | admin+ | `{ users, posts, comments, reactions, shares, views, follows, notifications, batches?: [ { batch, started_at, wiped_at? } ] }` |
| GET | `/admin/demo/verify` | admin+ | `{ "issues": [ { "check", "ok": bool, "detail" } ] }` |
| POST | `/admin/demo/seed` | `{ "force": true }` | `{ "report": { "users", "posts" } }` |
| POST | `/admin/demo/wipe` | `{}` | `{ "counts": { … } }` (values are summed by the UI) |

## 8. Realtime (Socket.IO replacement)

The old Express app pushed `notification` and `message` events over Socket.IO. That connection
is **removed** from the frontend; both features currently degrade gracefully (they update on
page load / after sending). Once the GET endpoints in §5 exist, I can add a lightweight REST
poller on the frontend (notifications every ~30 s for the unread badge + toasts; the open
message thread ~every 5 s) — **no backend work needed**. Nothing else depends on realtime.

---

## 9. Implementation checklist for the Code Snippets snippet

1. Register everything on `rest_api_init` in namespace `gadaviral/v1` (your existing health
   route is the pattern). Use route regexes like `/posts/(?P<id>[A-Za-z0-9_-]+)` and
   `/users/(?P<username>[A-Za-z0-9_]+)` — the app addresses users by **username** here (not id);
   admin routes address users by **id**.
2. Every route needs a `permission_callback`; share one helper (e.g. `gadv_require_auth()`)
   that validates the `Authorization: Bearer` access token, plus role helpers for
   MODERATOR / ADMIN / SUPER_ADMIN.
3. Token design (your choice — the frontend only cares about the JSON contract): signed access
   token (e.g. HS256 HMAC with a server-side secret) + single-use rotating refresh token stored
   server-side (usermeta or a custom table). Return both **top-level** from
   login / register / refresh. Keep refresh single-use so the frontend's one-retry-on-401
   behaviour can never loop.
4. Read JSON with `$request->get_json_params()`; uploads via `$request->get_file_params()`
   (field `media` for posts, `image` for avatar/cover). Store files in the WP media library and
   return **absolute URLs**.
5. Errors: always `WP_Error( code, message, ['status' => N] )` so the UI shows the API's message.
6. Exclude `/wp-json/` (at minimum `gadaviral/v1`) from LiteSpeed caching.
7. Google OAuth: `GET /auth/google/url` returns the consent URL; the callback 302s to
   `https://www.gadaviral.com/app/auth/google/complete?accessToken=…&isNew=…&needsProfile=…`.
8. Emails: 6-digit OTP for verification; reset links pointing to
   `https://www.gadaviral.com/app/reset-password?token=…`.
9. Suggested order (the UI degrades gracefully per missing route): auth block → `/auth/me` →
   posts + comments → users/follow → groups / events / businesses / search → notifications →
   messages → `community/highlights` → moderation/admin.

**Total: 67 routes** (1 health ✔ + 66 to implement). Every one above is derived from code the
frontend actually executes — nothing invented, nothing missing.




