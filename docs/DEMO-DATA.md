# Demo Data System (spec §45–87, §98–101)

## What it creates

| Item | Count |
|---|---|
| Ga/Dangme fictional users | **116** (curated name pools: Ga `Nii/Naa + given + surname`, Dangme `given + Dangme surname` incl. Krobo/Ada/Shai/Ningo/Prampram/Osudoku; ~14 diaspora in London/Toronto/NY/DC/Atlanta/Hamburg/Amsterdam/Berlin) |
| Generic DEMO account | **exactly 1** (`demo_tester` — not a Ga/Dangme persona; publishes test posts) |
| Posts | **exactly 150** (8 test + 98 category + 29 festival + 12 polls — wait, computed exactly; enforced by the seeder) |
| Groups | 15 (Ga Heritage … Music & Entertainment per spec §37) |
| Events | 6 fictional, titled `…(DEMO EVENT)` + `seed_note` |
| Businesses | 18 fictional directory listings |
| Pages | 4 |
| Follows / reactions / comments / replies / shares / views / poll votes / memberships / notifications / demo DMs | realistic volumes within every cap |

Dates: **1 May 2026 → 7 Sep 2026** (Africa/Accra = UTC), posting hours weighted
6–9am / 12–3pm / 6–10:30pm; festival posts clustered (Kplejoo May·Ga, Homowo
Jun–Aug·Ga, Ngmayem Jul–Aug·Krobo, Asafotufiam Jul–Aug·Ada, Dipo May·Krobo) with
**strict cultural ownership** verified at seed time. Engagement follows §68–72:
per-post caps 70/25/12/20/400, daily caps 15/5/4 per user, tier distribution
≈15 % low / 70 % normal / 15 % high with boosts for rich content.

## Tagging & safety (§83, §101)

Every demo row carries `is_demo = true`, `seed_batch = <uuid>`, `demo_source =
'seed-demo'` (users also get identifiable emails `@demo.gadaviral.test`).
Deleting demo data touches **only** rows where `is_demo = true` or rows
belonging to demo users — genuine users/content are never affected (proven by
`tests/demo.test.ts`).

## Commands

```bash
npm run seed:demo            # seed (fails if an active batch exists → prevents duplicates)
npm run seed:demo -- --force # wipe + regenerate in one step
npm run demo:verify          # 23 automated checks (spec §98)
npm run demo:wipe            # DELETE ALL DEMO DATA
npm run demo:stats           # counts (same numbers the admin dashboard shows)
```

## Admin dashboard

Website → **Admin → Demo data** shows live counts, seed batches, the §98
validation report and the two buttons:
**♻️ REGENERATE DEMO DATA** (`POST /admin/demo/seed {force:true}`) and
**🗑️ DELETE ALL DEMO DATA** (`POST /admin/demo/wipe`) — both super-explicit with
confirmation dialogs.

## API

```
GET  /api/v1/admin/demo/stats    # demo analytics (§87)
GET  /api/v1/admin/demo/verify   # run all §98 checks
POST /api/v1/admin/demo/seed     # { "force": true } → regenerate
POST /api/v1/admin/demo/wipe     # delete all demo rows
```

## Validation rules (§98) — enforced by `npm run demo:verify`

117 users (116 Ga/Dangme + 1 generic) · exactly 150 posts · no post before
1 May 2026 · none after 7 Sep 2026 · no future-dated interactions · unique
usernames · no duplicate reactions · valid relationships · festival ownership
correct · engagement caps (70/25/12/20/400 per post, 15/5/4 daily per user) ·
follows 10–35/user · every demo row tagged · active batch recorded.
