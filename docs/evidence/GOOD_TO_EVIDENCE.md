# Definition of Good → evidence

The README's Definition of Good is one sentence:

> Good advice is relevant, honest, and easy to give. The purchase belongs to
> the buyer. The opinions belong to the community.

That sentence dates from the Buy or Pass pivot
([`719deed`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-guangdeshi/commit/719deed), 2026-10-21).
It came with eight implications, which were rewritten into the current six
bullets in v2.0
([`b903ee0`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-guangdeshi/commit/b903ee0)).

This record sorts the shipped product into six analytical dimensions. They
were drawn up on 2026-11-07 to audit the final version. They are not the
original list.

For each dimension it gives:

- **Implementation:** where the dimension is built.
- **Rule:** the `CLAUDE.md` rule that governs it.
- **Evidence:** the check that exercises it, marked **enforced** (an automated
  check fails if it breaks) or **judged** (only a person can assess it).
- **Commits:** where it landed.
- **Limits:** what remains open.

The spec runs against a disposable instance (`pnpm dev:test`). Browser scripts
are run by hand against one.

## 1. Relevant human context

- **Implementation:**
  - A required description of at most 2000 characters (`src/validation.ts`).
  - Up to three optional category prompts plus free text
    (`src/context-prompts.ts`, ADR 0004).
  - A context card that shows only answered prompts (`contextCard` in
    `src/render.ts`).
- **Rule:** 25.
- **Evidence (enforced):**
  - `spec/context.test.ts` checks that unanswered prompts render nothing and
    that foreign keys are dropped.
  - `spec/unit.test.ts` checks the post validation.
- **Commits:** [`c865244`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-guangdeshi/commit/c865244),
  [`a5a62b7`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-guangdeshi/commit/a5a62b7).
- **Limits (judged, untested):**
  - Whether context makes advice more relevant has not been tested.
    `docs/product/HUMAN_EVALUATION_PROTOCOL.md` is prepared but not conducted.
  - Five categories share the generic prompts.

## 2. Low-friction participation

- **Implementation:**
  - An opinion is one stance (or one option) plus one comment of at most
    500 characters.
  - There is no wizard and no questionnaire.
  - Double-submission is guarded client-side. This is uncommitted at the time
    of writing.
- **Rules:** 13, 15.
- **Evidence:**
  - Enforced: `spec/posts-and-opinions.test.ts` (stance and comment rules),
    `spec/realtime-contract.test.ts` (validation).
  - Judged: whether one sentence is "easy". There is no timing or usability
    study.
- **Commits:** [`719deed`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-guangdeshi/commit/719deed).
- **Limits:**
  - The create-post form shows 12–15 inputs, and a photo is required unless
    the post is catalog-linked.
  - A comment is required, so there is no vote-only path.

## 3. Honest information and provenance

- **Implementation:**
  - Counts are live `COUNT` queries, never stored.
  - Demo rows carry `is_demo = 1`, are excluded from every real aggregate, and
    sit behind a banner in `/showcase`.
  - Catalog products are facts only: no price, rating or engagement.
  - Image and reference provenance is in `docs/research/`.
- **Rules:** 16, 24, 26, 28.
- **Evidence (enforced):**
  - `spec/discover-sources.test.ts`, `spec/demo.test.ts`,
    `spec/catalog.test.ts` ("never stores a price, rating…"),
    `spec/catalog-http.test.ts`.
  - The `postCard` "No opinions yet" tests in `spec/unit.test.ts`.
  - `spec/discover-references.test.ts`.
- **Commits:** [`c865244`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-guangdeshi/commit/c865244),
  [`c511a37`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-guangdeshi/commit/c511a37),
  [`cfb2379`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-guangdeshi/commit/cfb2379),
  [`f04658e`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-guangdeshi/commit/f04658e).
- **Limits:**
  - Opinions themselves are unverified claims. Nothing checks whether a
    commenter has owned the product.
  - A headphones "photo" that was really a 100px icon was found only by
    looking at a screenshot.

## 4. Buyer agency

- **Implementation:**
  - No verdict field or endpoint exists.
  - An author cannot opine on their own post (403).
  - Only the author records Bought / Didn't buy / Still deciding.
  - An optional influential marker is owner-only and same-post, and never
    changes counts.
- **Rules:** 14, 27.
- **Evidence (enforced):**
  - `spec/posts-and-opinions.test.ts` (TEST K, the self-vote 403).
  - `spec/influential-opinion.test.ts`.
  - `spec/comparison.test.ts` (no self-vote).
- **Commits:** [`719deed`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-guangdeshi/commit/719deed),
  [`c865244`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-guangdeshi/commit/c865244).
- **Limits:**
  - "No verdict exists" is shown by the absence of a field, not by a test that
    scans for one.
  - Whether buyers feel ownership of the decision is judged.

## 5. Real-time co-presence

- **Implementation:**
  - SSE on a per-post channel and on `/discover/events`.
  - Events carry ids only. Pages refetch their own server-rendered
    `[data-live-region]`s (ADR 0005).
- **Rule:** 29.
- **Evidence:**
  - Enforced: `spec/realtime-contract.test.ts` and `spec/realtime.test.ts`.
  - Run by hand: `scripts/verify-realtime.mjs`, with two browsers at
    1440×900 and 390×844. It covers every shared change, offline and
    reconnect, six concurrent voters, and Slow 3G.
- **Commits:** [`8911295`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-guangdeshi/commit/8911295),
  [`6214d4a`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-guangdeshi/commit/6214d4a),
  [`cdaf36f`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-guangdeshi/commit/cdaf36f).
- **Limits:**
  - The 2026-11-03 audit found that, before `8911295`, only votes were live.
  - Production timings (96–179ms) come from one two-browser session after
    release v8. They are not a load test.

## 6. Reliability and accountability

- **Implementation:**
  - `UNIQUE(post_id, user_id)` with a single-statement upsert.
  - Session-derived identity and inline ownership checks.
  - Logs that carry identifiers only.
  - A process-wide image-decode slot and memory-sized scrypt for the 256MB
    machine.
  - Tests refuse non-disposable targets.
- **Rules:** 14, 15, 17, 18, 22, 30.
- **Evidence:**
  - Enforced:
    - `spec/posts-and-opinions.test.ts` (concurrent submissions collapse to
      one row).
    - `spec/auth.test.ts`.
    - `spec/uploads.test.ts`.
    - `spec/unit.test.ts` (the scrypt memory ceiling and the decode slot).
    - `spec/global-setup.ts` and `/healthz/test-target`.
  - Run by hand: `scripts/verify-admin.mjs`.
- **Commits:** [`7a14d4d`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-guangdeshi/commit/7a14d4d),
  [`6214d4a`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-guangdeshi/commit/6214d4a),
  [`0345862`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-guangdeshi/commit/0345862),
  [`4e1674b`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-guangdeshi/commit/4e1674b).
- **Limits:**
  - Memory figures were measured on macOS, not on Fly's Linux machine.
  - There is no container runtime locally, so the image is first built in CI.
  - The C10 log rehearsal was automated (two headless profiles). It was not a
    classroom demonstration.

## Not claimed

No human user study has been run. The scripted personas in the 2026-11-05 UX
experiment (kept outside the repo) are functional checks, not user research.
Every "judged" item above is still open.
