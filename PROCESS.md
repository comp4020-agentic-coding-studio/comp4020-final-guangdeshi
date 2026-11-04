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

It was performed by CI run 39517220946 on
[`7a14d4d`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-guangdeshi/commit/7a14d4d)
(the OOM fix), with both its check and deploy jobs green. On 2026-11-03 the
live site still served that build: `/`, `/healthz` and `/readme/` answered
200, while v2.0's `/showcase` answered 404.

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

## v2.0 after its first pass: audits, a real catalog, live everything

Each later change on the branch came out of looking at the running app, not
from the plan:

- A visual design audit, run on screenshots of real labelled content at
  three viewports, found a logged-in nav 465px wide on a 390px screen and
  demo illustrations with truncated labels
  ([`899ca05`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-guangdeshi/commit/899ca05)),
  then shaped the approved "Decision Studio" redesign
  ([`58675e7`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-guangdeshi/commit/58675e7)).
  Screenshot review also caught Which One? cards always reading "No opinions
  yet", because the card looked for stance counts a comparison post never
  has
  ([`d3545b3`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-guangdeshi/commit/d3545b3)).
- A demo "photo" of headphones turned out to be a 100px line icon rendered
  as a black square; it was replaced with a licensed photograph, and
  source-linked real-world purchase discussions were added as clearly
  separate, vote-free cards
  ([`c511a37`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-guangdeshi/commit/c511a37)).
- Discover moved from fictional demos to 72 real products from Amazon
  Berkeley Objects (CC BY 4.0) with no prices, ratings or engagement, and
  the demos moved to a labelled `/showcase` archive
  ([`cfb2379`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-guangdeshi/commit/cfb2379),
  [`8031431`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-guangdeshi/commit/8031431),
  [`f04658e`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-guangdeshi/commit/f04658e)).
- A two-browser acceptance audit found that only votes met the brief's
  "visible within about a second" bar: new questions, edits, outcomes,
  influential markers and deletions all needed a reload. Every shared change
  now broadcasts an id-only event, and each page refetches its own
  server-rendered live regions
  ([`8911295`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-guangdeshi/commit/8911295);
  contract in ADR 0005,
  [`cdaf36f`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-guangdeshi/commit/cdaf36f)).
- During that audit a test run aimed at the wrong target wrote test accounts
  into the preview database. The spec and every account-creating browser
  script now refuse any instance that doesn't report itself disposable, and
  `scripts/verify-realtime.mjs` keeps two browsers open across the whole
  live-update matrix
  ([`6214d4a`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-guangdeshi/commit/6214d4a)).

The branch was merged to `main` as
[`7ac3504`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-guangdeshi/commit/7ac3504),
whose message records that migrations 0003-0008 were rehearsed on a backup
of the live database (integrity ok, no foreign-key violations, existing
live content preserved).

## v2.0 release: an image that never booted

The v2.0 merge to `main` failed CI (run 41562150309) and so never deployed;
production stayed on the pre-v2.0 build. The spec reported only "nothing is
answering", but the container log showed the real cause: `src/server.ts`
imports `scripts/seed-demo-content.ts` (the admin demo-seed route), and the
Dockerfile's final stage copied only `src/`. Every local run had used the
whole working tree, so nothing before CI ever exercised the built image.
The Dockerfile now also copies the seeder and the licensed source photos it
reads at runtime
([`0345862`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-guangdeshi/commit/0345862)).
With no container runtime on the development machine, the
fix was checked against a directory holding exactly the image's file set:
without `scripts/` it reproduced the CI crash; with it, the app booted,
`pnpm check` passed (201 tests) against it, `scripts/verify-admin.mjs` seeded
the demo set through a real browser, and the seeded posts and images
survived a restart. The image itself is first built by CI.

Exercising that route exposed a second, memory problem the merge would have
shipped: the seeder re-encoded its source photos (up to 5472x3648) at full
size, bypassing the 1600px bound real uploads get. Measured locally with
`/usr/bin/time -l` around the server during one admin seed, peak RSS was
~375MB; bounding the seeder to the same `OUTPUT_MAX_DIMENSION` brought it to
~195MB, and the stored demo images from 9.6MB to 3.0MB. These are macOS
figures, not Fly's Linux ones, and `--max-old-space-size` would not have
caught this, since `sharp`'s decode buffers live outside the V8 heap — the
before/after difference is the evidence, not the absolute numbers.

That prompted the same measurement on the ordinary upload path, with
worst-case-but-valid images (4096x4096, small files) posted to a fresh
disposable server per scenario. `src/images.ts` claimed
`sharp.concurrency(1)` made concurrent uploads queue; it only limits threads
within one image, and a post's photos went through `Promise.all`, so they
decoded in parallel. One post with four WebPs (1.3MB in total) took the
server from ~135MB to ~580MB. Every decode now takes one process-wide slot
(`src/image-slot.ts`, unit-tested in `spec/unit.test.ts`); peaks fell from
~280MB to ~180MB for four PNGs, ~580MB to ~250MB for four WebPs, and ~620MB
to ~260MB for three such WebP posts at once. WebP is still the most
expensive format (~110MB above baseline for one 16-megapixel image) and was
not traced further: its cost comes from inside libvips/libwebp, and Fly's
Linux/musl build may behave differently. Watching the live machine's memory
after the next deploy is the remaining check. Both memory fixes are in
[`4e1674b`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-guangdeshi/commit/4e1674b).

Verification of all three fixes together, on 2026-11-03, against a
`pnpm dev:test` instance built from the working tree:

- `pnpm typecheck` clean;
- `pnpm test`: 203 of 203 across 20 spec files (the 201 above plus the two
  decode-slot unit tests);
- `pnpm check:evidence` passing;
- in real headless Chromium:
  - `scripts/verify-browser.mjs` passed, with live updates in 56-82ms;
  - `scripts/verify-admin.mjs` passed, including the seed and its no-op
    re-run;
  - `scripts/verify-realtime.mjs` passed, at 52ms median and 86ms maximum
    end to end over 32 samples, and 8ms maximum from commit to visible;
  - `scripts/verify-catalog.mjs` passed.

These are localhost timings, not production ones. Not yet done:
- building the Docker image (CI is the first place that happens);
- the trufflehog secret scans, which only run in CI;
- measuring memory on Fly itself.
