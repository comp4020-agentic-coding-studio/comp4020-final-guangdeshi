# Definition of Good → evidence

The README's Definition of Good is one sentence:

> Good advice is relevant, honest, and easy to give. The purchase belongs to
> the buyer. The opinions belong to the community.

That sentence dates from the Buy or Pass pivot
([`719deed`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-guangdeshi/commit/719deed), 2026-10-21).
It came with eight implications, which were rewritten in v2.0
([`b903ee0`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-guangdeshi/commit/b903ee0)).

The six dimensions below are a later reading of that sentence for the app as
it exists. They were drawn up on 2026-11-07 and are not the original list.
The README uses the same six.

For each one, evidence is split four ways:

- **Tested:** an automated check in `spec/` fails if the claim breaks. The
  spec runs against a disposable instance (`pnpm dev:test`).
- **Browser:** exercised in real Chrome or Chromium by a `scripts/verify-*.mjs`
  script, run by hand against a disposable instance.
- **Human judgement:** a claim only a person can assess.
- **Not yet evaluated:** that judgement has not been made with real users.

## 1. Relevant human context

- **Implementation:**
  - A required description (`src/validation.ts`).
  - Up to three optional category prompts plus free text
    (`src/context-prompts.ts`, ADR 0004). Five of ten categories share the
    generic prompts.
  - `contextCard` (`src/render.ts`) shows only answered prompts.
- **Rule:** `CLAUDE.md` section 25.
- **Tested:** `spec/context.test.ts` (unanswered prompts render nothing,
  foreign keys are dropped, and edits persist); `spec/unit.test.ts` (post
  validation).
- **Browser:** `verify-realtime` edits a post's context and checks that it
  reaches a second open browser.
- **Human judgement:** whether context makes advice more relevant.
- **Not yet evaluated:** no user study.
  `docs/product/HUMAN_EVALUATION_PROTOCOL.md` is prepared only.
- **Commits:** [`c865244`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-guangdeshi/commit/c865244),
  [`a5a62b7`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-guangdeshi/commit/a5a62b7).

## 2. Low-friction participation

- **Implementation:**
  - An opinion is one stance (or one option) plus one comment of at most
    500 characters.
  - There is no wizard.
  - Each POST form submits once, so a slow double-click can't duplicate a
    post.
- **Rules:** 13, 15.
- **Tested:**
  - `spec/posts-and-opinions.test.ts` (stance and comment rules).
  - `spec/realtime-contract.test.ts` (validation).
  - `spec/submit-once.test.ts` (the submit guard, in jsdom).
- **Browser:**
  - `verify-browser` posts and changes an opinion across two browsers.
  - `verify-realtime` TEST 13 double-clicks "Publish post" under Slow 3G and
    finds one post.
- **Human judgement:** whether one stance and one sentence is easy enough.
- **Not yet evaluated.** Known friction stays:
  - the create-post form shows 12–15 inputs;
  - a photo is required unless the post is catalog-linked;
  - there is no vote-only path.
- **Commits:** [`719deed`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-guangdeshi/commit/719deed),
  [`9016912`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-guangdeshi/commit/9016912).

## 3. Honest information and provenance

- **Implementation:**
  - Counts are live `COUNT` queries.
  - Demo rows carry `is_demo = 1`, are kept out of real aggregates, and are
    bannered in `/showcase`.
  - Catalog products carry facts and sources, never prices, ratings or
    engagement.
  - Provenance is recorded in `docs/research/`.
- **Rules:** 16, 24, 26, 28.
- **Tested:**
  - `spec/discover-sources.test.ts`, `spec/demo.test.ts`.
  - `spec/catalog.test.ts` ("never stores a price, rating…").
  - `spec/catalog-http.test.ts`, `spec/discover-references.test.ts`.
  - The "No opinions yet" tests in `spec/unit.test.ts`.
- **Browser:** `verify-catalog`; `verify-realtime` TEST 8 (no demo or admin
  content in the live feed).
- **Human judgement:** whether the labels are clear to a visitor.
- **Not yet evaluated:** opinions themselves are unverified claims. A
  headphones "photo" that was really a 100px icon was found only by looking
  at a screenshot
  ([`c511a37`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-guangdeshi/commit/c511a37)).
- **Commits:** [`c865244`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-guangdeshi/commit/c865244),
  [`cfb2379`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-guangdeshi/commit/cfb2379),
  [`f04658e`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-guangdeshi/commit/f04658e).

## 4. Buyer agency

- **Implementation:**
  - Votes are never turned into a decision.
  - An author cannot opine on their own post.
  - Only the author records Bought / Didn't buy / Still deciding.
  - The influential marker is owner-only, same-post and count-neutral.
- **Rules:** 14, 27.
- **Tested:**
  - `spec/buyer-decides.test.ts`. A 3-to-1 vote leaves no outcome. The buyer
    can record the opposite of a unanimous vote, with the counts unchanged. A
    comparison option with every vote is not shown as bought. A mutation that
    showed "Bought it" whenever Buy led made the first test fail.
  - `spec/posts-and-opinions.test.ts` (TEST K and the self-vote 403).
  - `spec/influential-opinion.test.ts`, `spec/comparison.test.ts`.
- **Browser:**
  - `verify-browser` TEST I: the author records an outcome, and the other
    browser sees the read-only badge.
  - `verify-realtime`: influential mark and unmark, live.
- **Human judgement:** whether buyers feel the decision stays theirs, and
  whether the opinions help them decide with less uncertainty.
- **Not yet evaluated.**
- **Commits:** [`719deed`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-guangdeshi/commit/719deed),
  [`c865244`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-guangdeshi/commit/c865244),
  [`60fab79`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-guangdeshi/commit/60fab79).

## 5. Real-time co-presence

- **Implementation:**
  - SSE on a per-post channel and on `/discover/events`.
  - Events carry ids only. Pages refetch their own server-rendered
    `[data-live-region]`s (ADR 0005).
- **Rule:** 29.
- **Tested:** `spec/realtime-contract.test.ts`, `spec/realtime.test.ts`.
- **Browser:** `verify-realtime` keeps two browsers open across every shared
  change, offline and reconnect, six concurrent voters, and Slow 3G. On
  2026-11-08 it ran with `DESKTOP=1920x1080` beside 390×844, the two marking
  viewports: 64 of 64 checks passed, with end-to-end latency at a median of
  55ms and a maximum of 84ms (localhost)
  ([`8d8f744`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-guangdeshi/commit/8d8f744)).
- **Production:** after release v8, one two-browser session saw updates in
  96–179ms. This was not a load test.
- **Human judgement:** whether co-presence feels social. Not evaluated.
- **Commits:** [`8911295`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-guangdeshi/commit/8911295),
  [`6214d4a`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-guangdeshi/commit/6214d4a),
  [`cdaf36f`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-guangdeshi/commit/cdaf36f).

## 6. Reliability and accountability

- **Implementation:**
  - `UNIQUE(post_id, user_id)` with a single-statement upsert.
  - Session-derived identity and inline ownership checks.
  - Logs carry identifiers, never content.
  - A process-wide image-decode slot, and scrypt sized for the 256MB machine.
  - Tests refuse non-disposable targets.
- **Rules:** 14, 15, 17, 18, 22, 30.
- **Tested:**
  - `spec/posts-and-opinions.test.ts` (concurrent submits collapse to one
    row).
  - `spec/auth.test.ts`, `spec/uploads.test.ts`.
  - `spec/unit.test.ts` (scrypt memory ceiling, decode slot).
  - `spec/global-setup.ts` (the disposable-target guard).
- **Browser:** `verify-admin` (live admin log, non-admin 403).
- **Not yet evaluated:**
  - Memory was measured on macOS, not on Fly's Linux machine.
  - The image is first built in CI (there is no local container runtime).
  - The C10 log rehearsal used two automated profiles. It was not a
    classroom demonstration.
- **Commits:** [`7a14d4d`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-guangdeshi/commit/7a14d4d),
  [`6214d4a`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-guangdeshi/commit/6214d4a),
  [`0345862`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-guangdeshi/commit/0345862),
  [`4e1674b`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-guangdeshi/commit/4e1674b).

## Not claimed

No human user study has been run, so nothing here shows that Buy or Pass has
improved anyone's purchasing decision. The scripted personas in the
2026-11-05 UX experiment (kept outside the repo) are functional checks, not
user research.
