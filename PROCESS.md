# Process overview

## What this project is, and how it got here

This repository has carried three products across three crits: Pick-Up
Sticks (Crit 8), Bug Relay (Crit 9), and now Buy or Pass (Final Project) — a
social shopping-opinion platform where a user posts a purchase they're
considering and other logged-in users give an explicit 👍 Buy / 👎 Pass
opinion with a short comment, while the author decides independently. Each
pivot is a deliberate, confirmed decision, not a drift: Crit 8 → 9 is
recorded in this file's git history and `docs/adr/0001-concurrent-
investigation-evidence.md`; the Crit 9 → Final pivot is recorded in
`docs/adr/0002-pivot-bug-relay-to-buy-or-pass.md`. What carried forward
across all three: this repository's git history, its Fly.io app and volume,
and the plain-Node/`node:sqlite`/no-build-step stack decision from Crit 8.
What didn't: the product code itself, each time.

## Why Buy or Pass was built as an isolated prototype first

Rather than iterating on the new product directly in this repository, it was
built and fully verified as a separate, independent project before any file
here was touched — its own git repository, never sharing a working
directory or Fly deployment with this repo. This repo's own `CLAUDE.md`
(section 5) requires actually exercising a feature before calling it done,
and doing that iteration here would mean either a slow feedback loop (every
push can trigger a real CI run and a real Fly deployment) or skipping
verification to avoid it. The prototype let the full feature set be built,
broken, and fixed freely, so what migrated in already had 72 automated
tests passing, full Playwright browser verification across two independent
browser contexts, measured real-time propagation latency, and a confirmed
restart-persistence check.

## Stack

TypeScript on Node 24, run directly via Node's built-in type-stripping (no
build step, no bundler) — continuing Crit 8/9's decision. `node:sqlite` for
persistence, Server-Sent Events for real-time sync (chosen because every
live event here — a new opinion, an updated count — is server→client only;
WebSockets would add protocol complexity this product doesn't need). Two
small, actively maintained npm dependencies are new in this pivot: `sharp`
(image decoding, re-encoding, and metadata stripping) and `busboy`
(multipart form parsing) — added because correct, security-reviewed image-
upload handling is worth a real dependency rather than a hand-rolled parser,
unlike Bug Relay, which needed no file uploads at all.

## What migrated, and what was adapted versus kept

The prototype's `src/`, its own `spec/*.test.ts` files (added alongside,
not replacing, this repo's fixed `spec/invariants.test.ts`/
`global-setup.ts`/`README.md`), and its `docs/product/`, `docs/design/`,
`docs/architecture/`, and `docs/research/` trees all moved in.
`fly.toml`/`Dockerfile` were adapted, not replaced: the existing
`fly.toml` kept its region/machine/volume shape, gaining only
`DATABASE_PATH`/`UPLOAD_DIR` entries pointed at new filenames so Bug Relay's
existing `/data/bug-relay.db` on the live volume is never read or
overwritten; the Dockerfile gained a real `pnpm install` stage for the two
new runtime dependencies. `package.json` kept this repo's name and script
conventions. Bug Relay's own product code and product-specific specs were
removed from the working tree — fully recoverable from git history, the
`crit-8` tag, and the `backup/pre-buy-or-pass-migration-20261021` branch
pushed to origin before migration began.
`docs/adr/0001-concurrent-investigation-evidence.md` was kept untouched
alongside the new `0002`, since it documents a real decision this
repository's history actually made.

## Protecting prior history before migrating

Before any file was changed: the original `HEAD`
(`de6309b3eabd748abb72c74ea5327ab983965548`) was recorded, a backup branch
was created from it and pushed to `origin`, a full `git bundle --all`
backup was made and restore-tested, and the repository's one pre-existing
uncommitted change — the student's own first-person edits to
`reflections/crit-9.md` — was independently exported as a patch and a plain
copy before being confirmed still present in the working tree, untouched.

## C10 ("Fly by instruments") implementation

Server-side authorization is checked inline in each mutating route handler
(`src/server.ts`), deriving the caller's identity only from the session
cookie, never a client-supplied id — covering post/opinion ownership, the
author-can't-vote-on-own-post rule, and admin-only access to `/admin*`.
Structured activity logs (`src/logger.ts`) write one JSON line per
meaningful action to stdout and to an `activity_events` table, carrying a
request id, a truncated pseudonymous user id, the action, target, status,
and latency — never passwords, tokens, full emails, or free-text content. A
protected `/admin` page streams this log live over SSE and shows active-
user/event/failure counts and open reports with resolve/dismiss controls.
The one current-opinion-per-(post,user) rule is a real `UNIQUE` database
constraint plus a single `INSERT ... ON CONFLICT DO UPDATE` statement, not
an application-level check — see `docs/architecture/DATA_MODEL.md` for why
this is also the concurrency-safety mechanism under simultaneous
submissions. The two-person rehearsal procedure is in
`docs/architecture/C10_REHEARSAL.md` and `reflections/crit-10.md`.

## Data preservation on the shared Fly volume

The existing volume (`vol_vgnkkg7wp5z92714`) still holds Bug Relay's
`/data/bug-relay.db`. Buy or Pass's `fly.toml` configuration points it at
`/data/buyorpass.sqlite` and `/data/uploads/` instead — distinct paths on
the same volume, so the prior product's data is neither read nor
overwritten by this deploy. No migration script runs against the old
database, since the two products share no schema.

## Verification

`pnpm check` (typecheck plus the full `spec/` suite) passes against a
locally-run instance. Real-browser verification used Playwright driving
Chromium through two independent browser contexts
(`scripts/verify-browser.mjs`, `scripts/verify-admin.mjs`): registration,
post creation with an uploaded image, a second user's opinion appearing on
the first user's already-open page without a reload, a stance change
updating counts live, a purchase outcome being recorded, server-side
authorization denials, the admin log updating live, and the report/resolve
flow — all measured and screenshotted, not just asserted from code. A
server-restart test confirmed users, posts, opinions, and images all survive
restart identically. Live deployment verification against the actual
`comp4020-final-guangdeshi.fly.dev` URL is recorded separately once
performed, since local Playwright results don't substitute for it.
