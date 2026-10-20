# Data model

SQLite via `node:sqlite` (Node 24's built-in driver, no dependency), one file
on the Fly volume (`DATABASE_PATH`, default `./data/buyorpass.sqlite`),
WAL journal mode, foreign keys enforced. Schema lives in
`src/migrations.ts` as explicit, ordered, idempotent migrations tracked in a
`migrations` table — each migration runs inside its own transaction, so a
crash mid-migration can't leave the schema half-applied, and a migration
that already ran is never re-applied even across restarts.

## Tables

```
users            — account identity + credentials
sessions         — server-side session tokens (hashed) + CSRF secrets
categories       — fixed seed list (computing, audio, photography, ...)
user_interests   — many-to-many: users <-> categories, for feed boosting
images           — uploaded photo metadata (not the bytes; see below)
posts            — a purchasing question
post_images      — many-to-many, ordered: posts <-> images
opinions         — one BUY/PASS + comment per (post, user)
post_outcomes    — one Bought/Didn't Buy/Still Deciding per post
reports          — user-filed reports against a post or opinion
activity_events  — structured C10 log, mirrored to stdout
migrations       — tracks which schema migrations have run
```

## Key constraints (not just application-level checks)

- `users.email` and `users.handle` are both `UNIQUE` — enforced by SQLite,
  checked again at the application layer first only to return a friendly
  error instead of a raw constraint-violation exception.
- `opinions` has `UNIQUE (post_id, user_id)` — this is the actual mechanism
  behind "at most one active opinion per account per post" (brief §8), not
  just an app-level check. `src/db.ts`'s `upsertOpinion` is a single
  `INSERT ... ON CONFLICT (post_id, user_id) DO UPDATE` statement, so a
  second submission from the same user updates their existing row rather
  than ever creating a second one — see
  [AUTH_AND_PERMISSIONS.md](AUTH_AND_PERMISSIONS.md) for why this is also
  the concurrency-safety mechanism.
- `opinions.stance`, `posts.visibility`, `posts.status`, and
  `post_outcomes.status` all have `CHECK` constraints restricting them to
  their valid enum values at the database level, so a bug elsewhere in the
  code can't silently write an invalid state.
- Every foreign key has `ON DELETE CASCADE` (e.g. deleting a user's row
  would cascade to their sessions, posts, opinions, images) — in practice
  posts are soft-deleted (`status = 'deleted'`) rather than removed, so this
  mostly matters for test cleanup and the sessions/user_interests tables.

## Indexes

Chosen directly from the query patterns `src/db.ts` actually runs:

- `idx_posts_feed (status, visibility, created_at DESC)` — the Discover feed's
  default chronological query.
- `idx_posts_category (category_id, status, visibility, created_at DESC)` —
  category-filtered Discover.
- `idx_posts_author (author_id, created_at DESC)` — a user's own posts /
  profile page.
- `idx_opinions_post (post_id)` — fetching all opinions for a post detail
  page.
- `idx_opinions_user (user_id, created_at DESC)` — "opinions you've given" on
  a profile.
- `idx_activity_events_ts (ts DESC)` / `idx_activity_events_user` — the admin
  observability page's recent-activity and per-user queries.

## Why images are metadata rows, not blobs in SQLite

`images` stores an opaque UUID-based filename, MIME type, dimensions, and
byte size; the actual JPEG bytes live on disk under `UPLOAD_DIR`
(`./data/uploads`), which sits on the same Fly volume as the SQLite file —
so both survive a restart together. Storing large binary blobs in SQLite
rows would bloat the single database file and complicate the course's
one-volume deployment constraint for no benefit, since the filesystem
already does this well.

## Pagination

The Discover feed uses keyset (cursor) pagination
(`created_at|id` as the cursor, see `src/db.ts` `listFeed`) rather than
`OFFSET`, so performance doesn't degrade on later pages and concurrent
inserts don't shift page boundaries underneath a paginating client.

## Transactions

Multi-statement writes (creating a post + attaching its images, updating a
post + replacing its images, applying a migration) are wrapped in explicit
`BEGIN`/`COMMIT`/`ROLLBACK` in `src/db.ts` and `src/migrations.ts`, so a
failure partway through never leaves, e.g., a post row with no attached
images or a mix of old and new image attachments.
