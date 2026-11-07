# Your harness

This is the harness for the COMP4020/COMP8020 Final Project, **Buy or Pass**. It
lives in one repository, built across crits 8, 9 and 10 and the final
submission. `README.md` says what the product is and what "good" means.
This file says what the agent is held to while building it.

It has two parts:

- **Sections 1–12** are reusable development rules. They were carried
  forward from Crit 7
  ([`4183f5b`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-guangdeshi/commit/4183f5b))
  and survived both product pivots: Pick-Up Sticks → Bug Relay → Buy or Pass
  (ADR 0001, ADR 0002).
- **Sections 13–30** are Buy or Pass's own constraints. Most of them were
  added after a specific failure; the commit is named where that is so.

Section numbers are stable, because ADRs and research notes cite them. A rule
that changes keeps its number.

Keep this file sufficient, not exhaustive. Long reasoning belongs in an ADR or
a test, and the rule links to it. A new rule needs a real failure or a real
decision behind it.

## 1. Audit before acting

Before a new stage of work, check the actual state rather than this file or
memory:

- `git status` and `git log`;
- the brief on the course website;
- for anything about deployment, `flyctl status` and `flyctl releases`
  (read-only).

The "Current project state" block at the end is a snapshot that goes stale.

## 2. Decision boundary

The agent may investigate, propose alternatives, implement an approved
direction, and verify it.

Two kinds of decision stay with the developer:

- **Product-value decisions:** what "good" means, what counts as a person,
  what persists, the stack, which features exist.
- **High-risk actions:**
  - pushing, merging, deploying, or changing Fly secrets;
  - writing to production or preview data;
  - destructive volume or database operations;
  - force-pushing or rewriting history.

When an ambiguous product decision comes up, name it and give the options.
Then either wait, or take the smallest reasonable default and record which
default and why. A high-risk action always waits for explicit, in-the-moment
approval. An approval given for one release does not carry over to the next.

## 3. Stack is a real decision, not boilerplate

The brief ships no starter framework, so the stack gets a short rationale in
`PROCESS.md`. That record is what makes a later change of stack legible
rather than arbitrary.

## 4. Spec is backpressure, not judgement

`spec/` protects the promises that can be checked mechanically. Whether the
app is actually good is a human call, made by the crit, the tutor or a user
study.

Mark each README claim as **enforced** (a check fails if it breaks) or
**judged** (a person assesses it). Say the open judged items out loud. See
`docs/evidence/GOOD_TO_EVIDENCE.md`.

## 5. Verification before acceptance, at the right level

An agent's own completion claim is not evidence. A green suite proves only
what it exercises. Report every result at the level it actually reached:

1. **Typecheck** (`pnpm typecheck`): types only.
2. **Spec** (`pnpm test`): HTTP against a running disposable instance.
3. **Real browser:** `scripts/verify-*.mjs` in Chrome or Chromium. This is the
   only level that sees layout, live updates across two sessions, and form
   wiring.
   - Two v2.0 bugs were found only here, in
     [`a5a62b7`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-guangdeshi/commit/a5a62b7).
   - The two-browser audit found most shared changes weren't live, fixed in
     [`8911295`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-guangdeshi/commit/8911295).
4. **Container:** the image `Dockerfile` builds, in CI.
   - Local runs use the whole working tree, so they cannot show a file
     missing from the image. That is how the v2.0 release failed, fixed in
     [`0345862`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-guangdeshi/commit/0345862).
   - Anything `src/` imports or reads at runtime must be copied into the
     final stage.
   - With no local container runtime, check against a directory holding
     exactly the image's file set, and say that is what was done.
5. **Production:** read-only checks against `*.fly.dev`, `flyctl status` and
   `flyctl logs`.

For a UI change, exercise the golden path and at least one edge case before
calling it done. The edge case can be a reload, a duplicate action, a
restart, or a slow network.

Never present a lower level as a higher one:

- localhost timings are not production timings;
- macOS memory figures are not Fly figures;
- scripted personas are not user research.

If a level wasn't reached, say so.

## 6. Page invariants

`spec/invariants.test.ts` ships with the course and stays green. Every page
has:

- a real title;
- a mobile viewport meta tag;
- alt text where images exist.

`/readme/` publishes the README's headings in order, and unknown routes 404.
Both marking viewports (1920×1080 and 390×844) must work without horizontal
scroll.

## 7. Git / commit discipline

- Commit at meaningful stage boundaries.
- Before staging, read `git status` and the diff. Never run `git add -A` or
  `git add .` blind.
- A message names the decision or capability that landed.
- Never amend, squash, rebase or force-push published history. `PROCESS.md`
  and the reflections cite real hashes.
- Leave uncommitted work that belongs to someone else's review unstaged.

## 8. Secret handling

Never commit any of these:

- `mise.local.toml`;
- `.env` files;
- the Fly token;
- any other credential.

`.githooks/pre-commit` and CI's trufflehog scan are the backstop. Don't
bypass them.

## 9. Process evidence and authorship

- `PROCESS.md` and `reflections/crit-N.md` cite real commit hashes, not
  paraphrase. `pnpm check:evidence` checks that cited commits exist.
- `PROCESS.md` is rewritten to describe the current project, as the brief
  asks. The full earlier account is kept in `docs/evidence/PROCESS_LOG.md`.
- Reflections are never overwritten.
- The student drafts these themselves, per the brief:
  - `README.md`;
  - `PROCESS.md`;
  - `research-note.md`;
  - the reflection answers.

  The agent may find sources, check citations, report facts and gaps, and
  propose wording for review. It must not supply the student's motivations or
  judgements. Where those are needed, it leaves a clearly marked placeholder.

## 10. Step-by-step execution and reporting

For a non-trivial stage:

1. List the steps.
2. Do one at a time.
3. Report what changed, what was verified, and what is next.

An explicit request to work end-to-end overrides this for that request.

## 11. Scope control

Build only what the brief and the Definition of Good call for. A feature
that doesn't trace to the README earns nothing and adds risk.

Near a deadline, prefer fixing, verifying and documenting what exists over
new features. A proposal with real cost goes to the developer first (section
2). One example is the 2026-11-05 decision brief UX: prototyped outside the
repo, recommended for user testing, not implemented.

## 12. Communication language

The student's language preference governs only the agent's own reports and
questions. Everything in the repo stays in English: code, comments, commits
and documents.

## 13. The Definition of Good governs every decision

*Good advice is relevant, honest, and easy to give. The purchase belongs to
the buyer. The opinions belong to the community.*

Architecture, copy and tests trace back to that, not to generic CRUD
practice. When a request would compromise it, name the conflict. For example,
"just show an aggregate recommendation" would.

## 14. Authorization is server-side, in the handler

Every mutating route derives the caller from the session cookie
(`resolveSession`, `src/auth.ts`), never from a client-supplied id. The
ownership check sits in the same handler as the action. Enforced in
`src/server.ts`:

- users edit or delete only their own posts and opinions;
- only a post's author records its outcome;
- an author never opines on their own post;
- `/admin*` requires `isAdmin` on every request, including SSE and the stats
  API.

A new mutating route gets its check, plus a wrong-user test in
`spec/posts-and-opinions.test.ts`.

## 15. One current opinion per (post, user) is a database guarantee

`opinions` has `UNIQUE(post_id, user_id)`. `upsertOpinion` is a single
`INSERT ... ON CONFLICT DO UPDATE`. Never check-then-insert. The reasoning is
in `docs/architecture/DATA_MODEL.md`.

## 16. Never fabricate counts, votes, or activity

Counts, opinion lists and admin stats are computed live from `opinions`.
There is never a stored "engagement score", and demos never get seeded votes.
This backs README "Honest data".

## 17. Structured logging: identifiers only

`logEvent` (`src/logger.ts`) is the only path to `activity_events` and to
stdout for user actions. Never log any of these:

- passwords;
- session or CSRF values;
- full emails;
- image bytes;
- free text.

## 18. Image uploads: decode, re-encode, rename

`processAndStoreImage` (`src/images.ts`) is the only writer of uploaded files.
It does three things:

1. Decodes the file with `sharp`, which rejects anything that is not a real
   image.
2. Re-encodes it to JPEG within `OUTPUT_MAX_DIMENSION`, which strips
   metadata.
3. Stores it under a server-generated UUID.

Every decode takes the process-wide slot in `src/image-slot.ts` (section 22).

## 19. Unlisted is link-gated, not private

An unlisted post is out of feed, search and live feed events, but anyone with
the URL can view it. Copy must not call it private or secure.

## 20. The recommendation surface is replaceable and transparent

`RecommendationService` (`src/recommendation/types.ts`) has one
implementation: chronological with a category boost, no learned ranking.
Never fold a user's own BUY/PASS stance into their interest signal.

## 21. Protect the Fly volume's earlier data

The volume still holds `/data/bug-relay.db` and the older Pick-Up Sticks
data. Buy or Pass uses `/data/buyorpass.sqlite` and `/data/uploads`
(`fly.toml`). Never point at the old files. Never write cleanup that deletes
them. Never run a destructive `flyctl volumes` command without explicit
approval.

## 22. 256MB total: measure memory, don't assume it

The first deploy crash-looped on OOM kills. scrypt's `N=131072` cost about
128MB per hash, and a hash runs at every boot. Fixed in
[`7a14d4d`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-guangdeshi/commit/7a14d4d).

Later, parallel `sharp` decodes reached around 580MB locally for one
four-WebP post. The demo seeder hit around 375MB. Fixed in
[`4e1674b`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-guangdeshi/commit/4e1674b).

Before changing anything that allocates real memory, measure it:

- process RSS (`/usr/bin/time -l` or similar);
- worst-case-but-valid inputs;
- a fresh disposable server per scenario.

`--max-old-space-size` alone misses `sharp`, whose buffers live outside the
V8 heap. Report local figures as local.

## 23. A post's mode gates its opinion shape, server-side

`post_mode` is `BUY_PASS` or `WHICH_ONE` (ADR 0003). The opinion handler
rejects the wrong shape in both directions with a 400. It accepts a
`selectedOptionId` only after loading the option and checking
`option.postId === postId`. A new opinion-shaped mutation gets both
rejection tests in `spec/comparison.test.ts`.

## 24. Buy/Pass counts and option counts are separate, guarded queries

`getOpinionCounts` keeps `AND stance IS NOT NULL`, because comparison opinions
share the table with a NULL stance. Option counts go through
`getOptionCounts`. Never compute both in one query.

## 25. Context prompts are reviewed code config; answers are optional data

`src/context-prompts.ts` (ADR 0004) is treated like a schema. Bump
`CONTEXT_SCHEMA_VERSION` if a key's meaning changes. A `post_context` row
exists only when something was answered. `contextCard` renders only answered
prompts.

## 26. Demo content is `is_demo = 1` rows, never mixed into real aggregates

Demos go through the same `createPost`, `createDemoUser` and `upsertOpinion`
as real content (`scripts/seed-demo-content.ts`). Every feed, search or stat
over real activity needs `is_demo = 0`. Demos are listed only in `/showcase`.
The legacy `/discover/demo` and `?source=demo` redirect there. A demo page
always carries the non-dismissible "Demo scenario — AI-generated fictional
content" banner.

## 27. The influential marker is owner-set, same-post, count-neutral

Only the post's author may set `post_outcomes.influential_opinion_id`, and
only to an opinion loaded and checked to belong to that post. It is
`ON DELETE SET NULL`, verified before use (ADR 0003). It is independent of
recording an outcome, and it never enters a vote count.

## 28. Catalog products are facts, never engagement or prices

`src/catalog.ts` holds licensed product records
(`docs/research/PRODUCT_CATALOG_PROVENANCE.md`). A product never carries a
price, rating, review, stock status, discount or popularity score. The only
engagement shown is a live count of real public active non-demo posts
linking to it.

The sync is an idempotent upsert. It never deletes a product, and it never
touches user tables. Every product photo keeps its source id and URL and is
credited at `/credits`.

## 29. Every shared state change is live, and the server renders it

This applies to every user-visible shared change, not only votes. A two-browser
audit found most changes needed a reload, fixed in
[`8911295`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-guangdeshi/commit/8911295).

- A mutation broadcasts on the right channel (`src/sse.ts`), after its write,
  and never for a rejected request.
- Clients refetch their own server-rendered `[data-live-region]`s. They never
  build viewer-specific HTML from a payload.
- Feed events carry ids only, and only for posts that are or were public,
  active and non-demo.
- Add the event to `spec/realtime-contract.test.ts` and the behaviour to
  `scripts/verify-realtime.mjs`.

See ADR 0005.

## 30. Tests never touch preview or production data

The spec and every account-creating script refuse a target whose
`/healthz/test-target` doesn't report `disposable`. That requires
`BOP_DISPOSABLE_DB=1`, and is never true on Fly or for a `*preview*` database.
`scripts/verify-admin.mjs` also requires an explicit `DATABASE_PATH`. Use
`pnpm dev:test` or another throwaway instance, on a port that is not a
running preview.

Never weaken this check. A test run aimed at the wrong port once filled the
preview database with test accounts, fixed in
[`6214d4a`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-guangdeshi/commit/6214d4a).

---

## Current project state

Snapshot, checked 2026-11-07. Re-check it before relying on it (section 1).

```
PRODUCT:  Buy or Pass. A buyer posts a purchase they're considering, with
          optional context; others give 👍 Buy / 👎 Pass, or pick one of
          2-4 options, plus one comment; the buyer alone records the
          outcome. Discover starts from 72 licensed catalog products;
          labelled demos live in /showcase.
STACK:    Node 24 with type-stripping (no build step), node:sqlite with
          FTS5, Server-Sent Events, sharp + busboy. Rationale in PROCESS.md.
LIVE:     Fly release v8 (2026-11-04) serves main at 611c9b6; one
          shared-cpu-1x 256MB machine, one volume. Deploys go through CI on
          push to main.
BRANCH:   feature/buy-or-pass-v2 is ahead of main with reflection and
          documentation commits only; nothing on it is deployed.
OPEN:     research-note.md not yet written; crit-10 reflection answers
          left for the student; no human evaluation run
          (docs/product/HUMAN_EVALUATION_PROTOCOL.md is prepared only).
```
