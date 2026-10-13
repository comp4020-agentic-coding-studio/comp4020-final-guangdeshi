# Process overview

### Crit 8 — Pick-Up Sticks

For Crit 8, I deliberately built a very small proof of life instead of a
complete multiplayer game.

I chose Pick-Up Sticks because the core interaction is simple: a visitor
removes one stick, and that change remains for the next visitor.

I considered features such as realistic physics, collision detection,
realtime multiplayer, accounts, scoring, and more complex rules, but I
excluded them because they were not necessary to prove the main interaction.

The pile contains 24 sticks with fixed positions, rotations, lengths, and
z-index values. Instead of physical collision detection, only the highest
remaining stick can be removed.

Commit
[`8e3fb97`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-guangdeshi/commit/8e3fb97)
added the deterministic layout, server, and SQLite persistence. Removed
sticks are stored in the database, so they remain gone after reloads and
server restarts.

Commit
[`484eca1`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-guangdeshi/commit/484eca1)
added tests for persistence, duplicate removal, and invalid removal.

Commit
[`f89a449`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-guangdeshi/commit/f89a449)
consolidated the README, PROCESS, and Crit 8 reflection.

The main lesson was that I did not need to build the whole multiplayer
system to prove the idea. A small persistent interaction was enough to show
that one visitor can change what the next visitor sees.

### Crit 9 — pivot to Bug Relay, "All at once"

**The pivot.** Going into Crit 9, I replaced Pick-Up Sticks with a different
product entirely: Bug Relay, a real-time collaborative bug-investigation
tool. This was a deliberate decision, not a drift — I confirmed it explicitly
before any code changed, specifically because this repo's own `CLAUDE.md`
(decision boundary, section 2) requires naming a product-direction change
rather than silently picking one. I kept everything about Pick-Up Sticks that
wasn't the product itself: git history, the Fly.io app and its token/volume,
the CI pipeline, the plain-Node/`node:sqlite`/no-build-step stack decision
from Crit 8. `src/sticks.ts` and the `removed_sticks` table were removed
outright (the latter via a one-time `DROP TABLE IF EXISTS` in `src/db.ts`)
since nothing in Bug Relay references them.

**Scope for this crit.** The product brief describes three built-in
investigation cases; I built exactly one (Checkout Failure) completely rather
than three partially, per the brief's own stated priority order and this
repo's scope-control rule (`CLAUDE.md` section 11). The other two are named
on the landing page, visibly marked "coming soon," so the product's intended
shape is legible without claiming functionality that doesn't exist yet.

**What "good" meant for the concurrency decision.** The brief requires one
real decision about multi-user behaviour, benchmarked against this project's
own Definition of Good, not generic best practice. I chose **append-only
evidence**: every experiment submission is retained forever, including exact
duplicates, and the evidence board, hypothesis consistency, and
recommendation are always recomputed from the full persisted record rather
than stored as separately-mutable state. The alternative I seriously
considered and rejected was a single mutable "current leading hypothesis"
field, updated as evidence came in. I rejected it because it directly
contradicts two lines of the stated Good definition: "results can be
repeated" (a mutable field has no room for a confirming duplicate — it would
have nothing to overwrite) and "the system does not claim a definitive root
cause from insufficient evidence" (a mutable "current best" field reads as an
answer the moment it's non-null, which pushes toward premature certainty).
The full reasoning, including the drawbacks of the choice I made and the
conditions that would justify revisiting it, is in
`docs/adr/0001-concurrent-investigation-evidence.md`.

**The next-test algorithm.** I implemented expected information gain
(Shannon entropy reduction in bits, uniform prior over the hypotheses still
consistent with the evidence) over a small, fixed, predefined hypothesis set
per case — the brief's own suggested approach, chosen over a heuristic
because the hypothesis space is small enough (5 hypotheses, 8 combinations
for this case) that the exact computation is cheap and exactly verifiable.
`spec/recommend.test.ts` checks the first recommendation's score against a
hand-computed value
(`log2(5) - (0.4·log2(2) + 0.6·log2(3)) ≈ 0.971` bits) rather than just
trusting the implementation. `scripts/simulate-recommendations.ts` is a
deterministic offline comparison against two baselines on the real fixture;
run output (not invented numbers):

```
Info-gain recommendation strategy: 3 experiments
Fixed canonical-order strategy:     6 experiments
Random-untested-combo strategy:    mean 4.81 (min 3, max 7) over 200 seeded trials
```

The script's own printed caveat is load-bearing: 8 combinations is far too
small a space to support a general statistical claim — this is one
reproducible run on one fixture, not a benchmark result, and I'm not
claiming otherwise.

**Real-time transport.** Server-Sent Events, not WebSockets. This keeps the
zero-runtime-npm-dependency property from the Crit 8 stack decision (native
`EventSource` client-side, plain `node:http` `text/event-stream`
server-side, `src/sse.ts`) — the brief itself says the transport mechanism
isn't graded, only the observed ~1-second, no-reload behaviour is, so I
optimized for keeping the existing stack decision coherent rather than
reaching for a new dependency.

**Commits.** [`a9e148c`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-guangdeshi/commit/a9e148c)
is the product pivot itself: the Checkout Failure fixture and hypothesis set
(`src/cases/`), server-authoritative persistence (`src/db.ts`), the
landing/room pages and their client script (`src/pages.ts`, `src/ui.ts`),
and the routes (`src/server.ts`), with `src/sticks.ts` removed.
[`4230c73`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-guangdeshi/commit/4230c73)
adds the test suite: pure unit tests for the fixture and algorithm
(`spec/recommend.test.ts`) and HTTP-level tests against the running app
covering persistence, two independent participants, concurrent and duplicate
submissions, reveal, reset, and SSE delivery (`spec/bug-relay.test.ts`),
removing the now-obsolete `spec/pick-up-sticks.test.ts`.
[`da4c5b5`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-guangdeshi/commit/da4c5b5)
adds the concurrency ADR and the baseline-comparison simulation script.
[`53fd62a`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-guangdeshi/commit/53fd62a)
is a real bug found during browser verification, not a planned step: at
390px width the 5-column evidence table forced the whole page to scroll
horizontally (`document.documentElement.scrollWidth` measured 515px against
a 390px viewport). Fixed by scrolling the table within its own container
instead of letting it push the page wide; re-measured at 390px after the fix.

**Verification.** `pnpm check` (31 tests across `spec/recommend.test.ts`,
`spec/bug-relay.test.ts`, and the shipped `spec/invariants.test.ts`, plus
`tsc --noEmit`) passes against a locally-run instance. Docker was not
available in the local development environment this session ran in, so the
Dockerfile build itself was checked by inspection (it only copies `src/` and
`README.md`, both of which are everything the app needs — confirmed by
grepping for any reference outside those paths) rather than executed
locally; CI's `checks.yml` job runs the real build-and-test-the-image step on
push, which is the first execution of that exact path. Real-browser
verification used Playwright (added as a devDependency only — the Dockerfile
never runs `pnpm install`, so it doesn't reach the deployed image) driving
the system's installed Google Chrome via the `chrome` channel, with two
independent `BrowserContext`s (distinct cookies, distinct participants)
against the same room: a passing and a failing experiment from each side
updated the other side's evidence board, hypothesis list, and recommendation
within roughly a second with no reload; a reload of one context preserved
its evidence; a concurrent pair of submissions (one from each context, fired
together) both persisted as separate rows; desktop (1920×1080) and mobile
(390×844) were both checked for the landing page and the investigation room,
which is what surfaced and confirmed the fix for the mobile table-overflow
bug above. Screenshots from this pass were reviewed directly, not just
asserted from code.
