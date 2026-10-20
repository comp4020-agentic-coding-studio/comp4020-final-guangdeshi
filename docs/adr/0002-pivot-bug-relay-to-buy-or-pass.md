# ADR 0002: Pivot from Bug Relay to Buy or Pass for the Final Project

## Status

Accepted — Final Project / Crit 10.

## Context

This repository's product changed twice before this point: Crit 8 shipped
Pick-Up Sticks, Crit 9 pivoted to Bug Relay (a collaborative bug-
investigation tool), recorded in `docs/adr/0001-concurrent-investigation-
evidence.md` and the README's "Crit 8 → 9 pivot" note. For the Final
Project, the product pivots again, to **Buy or Pass** — a social shopping-
opinion platform ("You want it. What does everyone else think?"): a user
posts a purchase they're considering, other logged-in users give an explicit
👍 Buy / 👎 Pass opinion with a short comment, and the author decides for
themselves whether to buy.

Buy or Pass was built and fully verified as an independent, isolated
prototype at `~/Developer/COMP8020/buy-or-pass-prototype` — a separate git
repository, never sharing a working directory or deployment with this
repository or with the Fly application tied to it — before any file here was
touched. That isolation was deliberate: it let the full feature set be built,
tested (72 automated tests, full Playwright browser verification including
two independent browser contexts, measured real-time propagation, and a
restart-persistence check), and iterated on without any risk to this
repository's existing Crit 8/9 history or its live Fly deployment, exactly
the caution this course's own crit structure expects between pivots.

## Why pivot again, and why now

The Final Project brief's three fixed requirements — genuinely multi-user,
real-time (~1s), and persistent across restarts/redeploys — are
architecture-level constraints that Bug Relay already satisfies in roughly
the same shape (SSE, `node:sqlite`, a single Fly volume). The decision to
pivot the *product* rather than extend Bug Relay was made independently of
this repository, as part of the separate Buy or Pass prototype's own product
brief; this ADR records the migration of that already-decided, already-
verified product into the official repository, not the product decision
itself (which belongs to Buy or Pass's own
`docs/product/PRODUCT_BRIEF.md`).

## Decision

**Migrate Buy or Pass's application code into this repository's existing
infrastructure, rather than copying the prototype wholesale over the top of
it.** Concretely, adapted (not blindly copied):

- `src/` — Buy or Pass's TypeScript source, with `DATABASE_PATH`/`UPLOAD_DIR`
  defaults kept configurable via environment variables (as they already
  were in the prototype) so this repo's `fly.toml`/Dockerfile conventions
  apply unchanged.
- `fly.toml` — kept this repository's existing file (same app, same region,
  same one-machine/one-volume shape); only the `[env]` block gained Buy or
  Pass's `DATABASE_PATH`/`UPLOAD_DIR` entries, pointed at new filenames
  (`/data/buyorpass.sqlite`, `/data/uploads`) so Bug Relay's existing
  `/data/bug-relay.db` on the live volume is left untouched rather than
  overwritten — see "Data preservation" below.
- `Dockerfile` — adapted this repository's existing file to Buy or Pass's
  entry point and its two small runtime dependencies (`sharp`, `busboy`),
  which Bug Relay's zero-dependency Dockerfile didn't need to install.
- `package.json` — kept this repository's name/scripts shape
  (`typecheck`/`check`/`check:evidence`/`test`), added Buy or Pass's two
  runtime dependencies and its browser-test scripts.
- `.github/trufflehog.yml`, `.githooks/pre-commit`, `mise.toml`,
  `pnpm-workspace.yaml` — kept as-is; these are the course's own tooling
  contract and apply to whatever the app is built with, unchanged by the
  product pivot. `.gitignore` gained entries for Buy or Pass's local runtime
  state (`data/`, `screenshots/`) that Bug Relay's own `.gitignore` never
  needed. `.github/workflows/checks.yml` needed one real change, not zero:
  its `docker run` command only ever set `PORT`, relying on Bug Relay's own
  `src/db.ts` defaulting straight to `/data/bug-relay.db` even with no env
  var set. Buy or Pass's `src/db.ts`/`src/images.ts` default to a local
  relative path instead (`./data/...`), needed so `spec/unit.test.ts` — which
  imports `src/auth.ts` → `src/db.ts` directly inside the vitest process,
  outside any running server — doesn't try to create `/data` and fail
  locally without root. That means the CI container, which sets no
  `DATABASE_PATH`/`UPLOAD_DIR`, would otherwise silently write inside its
  own ephemeral image filesystem instead of the `--tmpfs /data` mount it
  provides — never actually exercising the real persistence path. Fixed by
  adding `-e DATABASE_PATH=/data/buyorpass.sqlite -e
  UPLOAD_DIR=/data/uploads` to that one `docker run` line, mirroring what
  `fly.toml`'s `[env]` block already sets for the real deployment. Caught by
  actually running `pnpm check` end-to-end in this repository after
  migrating, not assumed from the prototype's own passing tests.
- `spec/README.md`, `spec/invariants.test.ts`, `spec/global-setup.ts` — kept
  this repository's versions (same `/` and `/readme/` checks the course
  relies on); Buy or Pass's own additional spec files replace Bug Relay's
  product-specific tests (`bug-relay.test.ts`, `recommend.test.ts`), since
  those tested Bug Relay's own case-and-recommendation logic, which no
  longer exists in this repo's `src/`.
- `README.md`, `CLAUDE.md`, `PROCESS.md` — replaced with Buy or Pass's
  versions (the Definition of Good, operating rules, and process account
  are product-specific), with a pivot note added to `README.md` in the same
  style as the existing "Crit 8 → 9 pivot" callout, and the migration
  recorded as a new dated entry in `PROCESS.md` rather than rewriting its
  Crit 8/9 history.
- `reflections/crit-8.md`, `reflections/crit-9.md` — preserved byte-for-byte,
  including the student's own uncommitted Crit 9 edits present in the
  working tree before this migration began. `reflections/crit-10.md` is new.
- `docs/adr/0001-concurrent-investigation-evidence.md` — preserved; it
  documents a real decision made for Bug Relay and remains part of this
  repository's honest history even though that product is no longer what's
  deployed. This file (`0002`) is additive, not a replacement.
- Bug Relay's product-specific source (`src/cases/`, `src/recommend.ts`,
  `scripts/simulate-recommendations.ts`) and its two product-specific spec
  files are removed from the working tree, since they implement a product
  no longer present — but remain fully recoverable from git history (every
  prior commit, the `crit-8` tag, and the
  `backup/pre-buy-or-pass-migration-20261021` branch, pushed to origin
  before this migration) at any time.

## Data preservation on the live Fly volume

The existing Fly application (`comp4020-final-guangdeshi`) has one volume
(`vol_vgnkkg7wp5z92714`) containing Bug Relay's SQLite database at
`/data/bug-relay.db`. Buy or Pass is configured (via `fly.toml`'s `[env]`
block) to use `/data/buyorpass.sqlite` and `/data/uploads/` — different
paths on the same volume. This means:

- Bug Relay's existing data is **never read, written, or deleted** by Buy or
  Pass; it simply sits alongside the new files, untouched, as historical
  data from the prior product.
- No migration script runs against the old database — there is nothing to
  migrate, since the two products' schemas share no structure.
- The volume is never reformatted, resized destructively, or detached.

This was the explicitly chosen option (over exporting/archiving Bug Relay's
data elsewhere, or deleting it) because it requires zero destructive
operations and zero risk to data that, while no longer relevant to the
deployed product, is still real Crit 9 evidence that shouldn't be erased on
a pivot any more than the Crit 8/9 git history should be.

## Consequences

- **Positive**: the official repository's full audit trail — Pick-Up
  Sticks → Bug Relay → Buy or Pass — remains intact and inspectable from
  `git log`, exactly mirroring how the Crit 8 → 9 pivot was already handled.
  A marker can `git show crit-8` or check out the backup branch to see
  exactly what existed before this migration.
- **Positive**: Buy or Pass arrives already verified (72 tests, full
  Playwright coverage, measured realtime latency, restart-persistence
  confirmed) from its isolated development, rather than being built and
  debugged for the first time inside the repository that also runs the
  course's CI/deploy pipeline and triggers real Fly charges on every push.
- **Negative / limitation**: Bug Relay's own tests and simulation script are
  removed from the working tree's `spec/`/`scripts/`, so `pnpm check` no
  longer exercises Bug Relay's recommendation algorithm — acceptable because
  that product is no longer what's deployed, and its logic remains
  inspectable in history, but noted here rather than silently dropped.
- **Negative / limitation**: the live volume will accumulate both products'
  on-disk files indefinitely (Bug Relay's old DB file plus Buy or Pass's
  new ones) until someone deliberately cleans it up — acceptable for a
  256MB-memory/1GB-volume student project at this data scale, but a real
  cost if this pattern repeated across many more pivots.
