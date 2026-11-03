# Process overview

## What this project is, and how it got here

This repository has carried three products: Pick-Up Sticks (Crit 8), Bug
Relay (Crit 9), and Buy or Pass (Final Project) — a social shopping-opinion
platform where a user posts a purchase they're considering and other
logged-in users give an explicit 👍 Buy / 👎 Pass opinion with a short
comment, while the author decides independently. Each pivot is a deliberate,
recorded decision: Crit 8 → 9 in `docs/adr/0001-concurrent-investigation-
evidence.md`; Crit 9 → Final in `docs/adr/0002-pivot-bug-relay-to-buy-or-
pass.md`. What carried forward across all three: git history, the Fly.io
app and volume, and the plain-Node/`node:sqlite`/no-build-step stack from
Crit 8. What didn't: the product code itself, each time.

## Why Buy or Pass was built as an isolated prototype first

Buy or Pass was built and fully verified as a separate project — its own
git repository, never sharing a working directory or Fly deployment with
this repo — before any file here was touched. This repo's `CLAUDE.md`
(section 5) requires actually exercising a feature before calling it done,
and iterating directly here would mean either a slow feedback loop or
skipping verification to avoid it. The prototype let the full feature set
be built, broken, and fixed freely before migration.

## Stack

TypeScript on Node 24, type-stripping (no build step), `node:sqlite` for
persistence (including FTS5 full-text search, added in v2.0), Server-Sent
Events for real-time sync — every live event here is server→client only,
so WebSockets would add protocol complexity this product doesn't need.
`sharp` (image decoding/re-encoding/metadata stripping) and `busboy`
(multipart parsing) are the only two npm dependencies, new in the Bug
Relay → Buy or Pass pivot since Bug Relay had no file uploads.

## Migration and history protection

The prototype's `src/`, its `spec/*.test.ts` files, and its `docs/`
subtrees moved in; `fly.toml` gained `DATABASE_PATH`/`UPLOAD_DIR` entries
so Bug Relay's existing `/data/bug-relay.db` is never read or overwritten.
Before any file was changed: the original `HEAD`
(`de6309b3eabd748abb72c74ea5327ab983965548`) was recorded, a backup branch
was pushed to origin, a full `git bundle --all` backup was made and
restore-tested, and the one pre-existing uncommitted change —
`reflections/crit-9.md` — was confirmed untouched in the working tree. The
migration commit is
[`719deed`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-guangdeshi/commit/719deed).

## C10 ("Fly by instruments")

Server-side authorization is checked inline in each mutating route
handler, deriving identity only from the session cookie. Structured
activity logs (`src/logger.ts`) write one line per action to stdout and an
`activity_events` table — never passwords, tokens, full emails, or
free-text content. A protected `/admin` page streams this live over SSE.
First-admin provisioning is a secret-gated, self-disabling route; no
credential is baked into the app.

## A real production incident

The first deploy after migration crash-looped: `src/auth.ts`'s scrypt
parameters (`N=131072`, OWASP's dedicated-auth-server tier, unexamined
from the prototype) cost ~128MB per hash call on a 256MB machine, computed
once at module load on *every boot*. Fixed by lowering to `N=16384`
(~16MB/call), verified with `--max-old-space-size=180` and a real image
upload staying under budget — not assumed safe from the number alone.
Two smaller CI gaps (`RATE_LIMIT_SCALE`, a longer `vitest` timeout) were
likewise caught by actually running `pnpm check`, not by trusting the
prototype's own passing tests.

## Verification (pre-v2.0)

`pnpm check` passes locally and in CI. Real-browser verification
(`scripts/verify-browser.mjs`, `scripts/verify-admin.mjs`) covers
registration, an opinion appearing live without a reload, a purchase
outcome, authorization denials, and the live admin log. A server-restart
test confirmed data survives restart. Live deployment against
`comp4020-final-guangdeshi.fly.dev` is recorded once performed.

## v2.0: responding to tutor feedback

The tutor accepted the concept but found the response to the brief
underdeveloped across twelve observations (full text and per-observation
response in `docs/product/TUTOR_FEEDBACK_RESPONSE.md`). Five features
answer them: adaptive per-category purchasing context, a "Which One?" mode
comparing 2-4 products, transparent FTS5 search over past decisions, demo
content for an otherwise-empty community, and an optional "influenced my
decision" marker. Supporting research — verified license/maintenance
status for 8 reference repositories, real purchase-advice community
conventions — is in `docs/research/COMPETITIVE_DESIGN_ANALYSIS.md`; schema
rationale is in `docs/adr/0003` and `0004`.

Every new migration (`src/migrations.ts` 0003-0007) is additive: a
`DEFAULT 'BUY_PASS'` on `post_mode` means no pre-v2.0 post needs a
backfill, and the `opinions` table rebuild (needed to make `stance`
nullable) was verified against both a fresh database and a simulated
pre-v2.0 database before being committed. One schema decision was caught
and fixed before any commit through direct testing: `post_outcomes.
influential_opinion_id` initially defaulted to blocking a delete with a
foreign-key violation, the opposite of "a deleted opinion must not leave a
broken reference" — changed to `ON DELETE SET NULL` and re-verified with a
throwaway script.

Two further bugs were found only by exercising the new UI in a real
browser, not by typecheck or unit tests: the create-post form's
mode-selector was rendered outside the `<form>` element, so a submission
never actually carried which mode was selected; and `busboy`'s field-count
limit, left at its pre-v2.0 value of 30, silently dropped fields once the
form grew to include every category's context prompts and up to four
option blocks at once (raised to 200). Both are recorded in commit
[`a5a62b7`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-guangdeshi/commit/a5a62b7).

Demo content (18 scenarios, `src/demo-scenarios.ts`) was authored by
Claude as part of this development session, never via a runtime LLM API
call. Images are a verified hybrid: four real Wikimedia Commons
photographs with checked, recorded licenses
(`docs/research/IMAGE_PROVENANCE.md`), and original `sharp`-composited
illustrations elsewhere — both re-encoded through the same path a real
upload goes through.

Commits: backend
([`c865244`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-guangdeshi/commit/c865244)),
frontend plus the two bug fixes
([`a5a62b7`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-guangdeshi/commit/a5a62b7)),
41 new tests across five spec files
([`5492bf0`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-guangdeshi/commit/5492bf0)).
`pnpm check` passes: 116 tests (75 pre-existing, unchanged, plus 41 new),
verified against a freshly reset local database. Developed entirely on
`feature/buy-or-pass-v2`; per explicit instruction for this session, not
merged to `main` or deployed to the live Fly app.
