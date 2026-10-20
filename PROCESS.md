# Process overview

## What this project is, and how it got here

This repository has carried three products across three crits: Pick-Up
Sticks (Crit 8), Bug Relay (Crit 9), and now Buy or Pass (Final Project) — a
social shopping-opinion platform where a user posts a purchase they're
considering and other logged-in users give an explicit 👍 Buy / 👎 Pass
opinion with a short comment, while the author decides independently. Each
pivot is a deliberate, confirmed decision, not a drift: Crit 8 → 9 is
recorded in `docs/adr/0001-concurrent-investigation-evidence.md`; the
Crit 9 → Final pivot is in `docs/adr/0002-pivot-bug-relay-to-buy-or-pass.md`.
What carried forward across all three: this repository's git history, its
Fly.io app and volume, and the plain-Node/`node:sqlite`/no-build-step stack
decision from Crit 8. What didn't: the product code itself, each time.

## Why Buy or Pass was built as an isolated prototype first

Rather than iterating on the new product directly in this repository, it was
built and fully verified as a separate, independent project before any file
here was touched — its own git repository, never sharing a working
directory or Fly deployment with this repo. This repo's own `CLAUDE.md`
(section 5) requires actually exercising a feature before calling it done,
and doing that iteration here would mean either a slow feedback loop or
skipping verification to avoid it. The prototype let the full feature set be
built, broken, and fixed freely before migration — see "Verification"
below for what that actually caught in this repository afterward too.

## Stack

TypeScript on Node 24, type-stripping (no build step), `node:sqlite` for
persistence, Server-Sent Events for real-time sync (every live event here —
a new opinion, an updated count — is server→client only, so WebSockets
would add protocol complexity this product doesn't need). Two small npm
dependencies are new in this pivot: `sharp` (image decoding, re-encoding,
metadata stripping) and `busboy` (multipart parsing) — Bug Relay needed
neither, since it had no file uploads.

## What migrated, and what was adapted versus kept

The prototype's `src/`, its own `spec/*.test.ts` files (alongside, not
replacing, this repo's fixed `spec/invariants.test.ts`/`global-setup.ts`),
and its `docs/product/`, `docs/design/`, `docs/architecture/`,
`docs/research/` trees moved in. `fly.toml` kept its region/machine/volume
shape, gaining only `DATABASE_PATH`/`UPLOAD_DIR` entries so Bug Relay's
existing `/data/bug-relay.db` is never read or overwritten; the Dockerfile
gained a real `pnpm install` stage for the two new dependencies.
`package.json` kept this repo's name and script conventions. Bug Relay's
own product code and specs were removed from the working tree — fully
recoverable from git history, the `crit-8` tag, and the
`backup/pre-buy-or-pass-migration-20261021` branch pushed to origin before
migration. `docs/adr/0001` was kept untouched alongside the new `0002`. The
migration commit is
[`719deed`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-guangdeshi/commit/719deed).

## Protecting prior history before migrating

Before any file was changed: the original `HEAD`
(`de6309b3eabd748abb72c74ea5327ab983965548`) was recorded, a backup branch
was created from it and pushed to `origin`, a full `git bundle --all`
backup was made and restore-tested, and the repository's one pre-existing
uncommitted change — the student's own first-person edits to
`reflections/crit-9.md` — was independently exported as a patch and a plain
copy before being confirmed still present in the working tree, untouched.

## C10 ("Fly by instruments") implementation

Server-side authorization is checked inline in each mutating route handler,
deriving the caller's identity only from the session cookie — covering
post/opinion ownership, the author-can't-vote-on-own-post rule, and
admin-only access to `/admin*`. Structured activity logs (`src/logger.ts`)
write one JSON line per action to stdout and to an `activity_events` table,
carrying a request id, a truncated pseudonymous user id, the action, target,
status, and latency — never passwords, tokens, full emails, or free-text
content. A protected `/admin` page streams this log live over SSE. The
one-opinion-per-(post,user) rule is a real `UNIQUE` constraint plus a single
`INSERT ... ON CONFLICT DO UPDATE`, not an app-level check. First-admin
provisioning is a secret-gated, self-disabling `POST /admin/bootstrap` route
(`ADMIN_BOOTSTRAP_SECRET`, set via `flyctl secrets set`, never committed) —
no admin credential is baked into the app anywhere. The rehearsal procedure
is in `docs/architecture/C10_REHEARSAL.md` and `reflections/crit-10.md`.

## Data preservation on the shared Fly volume

The existing volume still holds Bug Relay's `/data/bug-relay.db`. Buy or
Pass's `fly.toml` points it at `/data/buyorpass.sqlite` and `/data/uploads/`
instead — distinct paths on the same volume, so the prior product's data is
neither read nor overwritten.

## A real production incident, found during deployment verification

The first deploy attempt after migration crash-looped: Fly's logs showed
repeated `Out of memory: Killed process ... MainThread` within seconds of
boot, the machine hit its max restart count, and the live site served 502s.
The cause was `src/auth.ts`'s scrypt parameters: `N=131072` (OWASP's
dedicated-auth-server tier, carried over unexamined from the prototype,
where it never mattered because local machines have far more than 256MB)
costs `128*N*r` bytes — **~128MB for one hash call** — on a machine with
only 256MB total. Worse, a dummy hash is computed once at module load (to
equalize login timing between real and nonexistent accounts), so this ran
on *every single boot*, before the server even started listening, not just
under load. Fixed by lowering to `N=16384` (OWASP's limited-memory tier,
~16MB/call, ~20ms), verified by actually constraining a local Node process's
heap (`--max-old-space-size=180`) and confirming registration, login, and a
real image upload all stayed well under budget — not just assumed safe from
the lower number. `sharp.concurrency(1)` was also added as headroom against
concurrent uploads, given the same 256MB ceiling. Two earlier, smaller gaps
were also caught by actually running `pnpm check` in this repository post-
migration rather than trusting the prototype's own passing tests: the CI
container's test run needed `RATE_LIMIT_SCALE` (the spec registers ~45
accounts from one IP in seconds, which real rate limits correctly treat as
abuse) and a longer `vitest` timeout (`vitest.config.ts` wasn't copied over
with the rest of `spec/`, so one image-heavy test exceeded CI's shared-
runner timing under the course template's 5s default).

## Verification

`pnpm check` passes locally and in CI. Real-browser verification
(`scripts/verify-browser.mjs`, `scripts/verify-admin.mjs`) covers
registration, post creation with an image, a second user's opinion
appearing live without a reload, a stance change updating counts, a
purchase outcome, authorization denials, and the live admin log — all
measured and screenshotted. A server-restart test confirmed all data
survives restart. Live deployment verification against the actual
`comp4020-final-guangdeshi.fly.dev` URL, after the memory fix, is recorded
once performed.
