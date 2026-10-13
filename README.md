# Bug Relay

**Find the condition. Fix the mystery. Together.**

Bug Relay is a small, real-time, collaborative tool for turning scattered bug
reports into reproducible evidence. It's a COMP4020/COMP8020 Final Project,
built across Crits 8–10.

> **Crit 8 → 9 pivot.** This repo's Crit 8 submission was a different
> product, "Pick-Up Sticks" (a single-player persistent stick-removal toy).
> For Crit 9 the product changed to Bug Relay; the decision and reasoning are
> recorded in `PROCESS.md`. Git history, the Fly.io app, and the
> stack/persistence conventions carried forward; the product code did not.

## Who this is for, and the problem it solves

Small web-dev teams, students, and open-source contributors debugging a
reproducible UI or browser problem. The usual failure mode: one developer
reports a bug, another can't reproduce it, and the conditions that actually
matter — a specific input combination, a viewport width, a timing window —
never get written down consistently. Evidence scatters across screenshots,
chat messages, and "works on my machine."

Bug Relay turns that into a shared, structured investigation: everyone in a
room runs controlled experiments against the same small fixture, every
result is recorded automatically and broadcast live, and the app recommends
which untested condition would rule out the most remaining explanations —
so the next test is clearer than the last one, for everyone in the room.

This is **not** an issue tracker, a Jira clone, or a chatroom. The
distinguishing experience is that one person's observation changes what the
*next* person should test.

## The core workflow

1. Open a case (right now: **Checkout Failure**, at `/cases/checkout-failure`).
   The URL is stable and shared — opening it either starts the investigation
   or joins whatever evidence others have already collected.
2. Set a display name. Looking around needs no name; running an experiment
   does, so every result is attributed to someone.
3. In the test playground, choose a combination of conditions (shipping
   method, payment method, promo code) and run it. The app — not the
   participant — decides pass or fail, by checking the fixture's real
   behaviour against its expected behaviour.
4. The result is persisted, appears on the shared evidence board, and is
   broadcast to every other open session in that room within about a second,
   with no reload.
5. The next-test recommendation updates based on everyone's accumulated
   evidence, naming which untested combination would rule out the most
   remaining candidate explanations and why.
6. Once the evidence narrows to exactly one remaining explanation, anyone can
   reveal the fixture's real, hidden cause.
7. Reset clears a case's evidence for everyone, for starting over.

## Definition of Good

This is a **hypothesis**, stated up front and revisable — not a proven
outcome:

> Good collaborative debugging helps people turn scattered and conflicting
> observations into reproducible evidence, so the next test becomes clearer
> for everyone.

Concretely, that means:

- A stranger can start an investigation without training.
- Each test has an explicit setup, action, and observable result.
- Results can be repeated — a duplicate test is evidence, not noise, and is
  never silently discarded.
- Investigators can distinguish observations (what the evidence board shows)
  from hypotheses (what the candidate-explanation list shows) from the known
  fixture ground truth (hidden until reveal).
- New evidence updates the shared investigation state immediately for
  everyone watching.
- Two users can meaningfully influence each other's next task — the
  recommendation is computed from everyone's combined evidence, not just
  your own.
- The system does not claim a definitive root cause from insufficient
  evidence: the "reveal" action only works once the evidence has actually
  narrowed the candidates to exactly one.
- The app is understandable on both desktop and mobile.
- Evidence survives reload, reconnect, and server restart.

## What this version can and cannot do

**Can, as of Crit 9:**
- One complete, real investigation case: Checkout Failure, with a genuine
  (if small) fixture bug, 8 testable condition combinations, and 5
  predefined candidate explanations.
- Anonymous but distinguishable participants, persisted display names.
- Experiments are automatically evaluated, persisted to SQLite, and survive
  a reload or a server restart.
- Real-time sync over Server-Sent Events: a new experiment, a reset, or a
  presence change reaches every other open session in the room in
  approximately one second, without a page reload.
- A real, unit-tested next-test algorithm (expected information gain over a
  fixed hypothesis set — see "The next-test algorithm" below), compared
  against two baselines in `scripts/simulate-recommendations.ts`.
- A documented concurrency policy (`docs/adr/0001-concurrent-investigation-evidence.md`):
  evidence is append-only, every submission is retained, and the
  recommendation is always recomputed from the full persisted record.

**Cannot yet (explicitly deferred, not forgotten):**
- The other two built-in cases from the product brief — Responsive Layout Bug
  and Async State Bug — are named on the landing page but not yet
  implemented. Shipping one complete case reliably was prioritised over three
  unfinished ones.
- No room picker: a case's URL *is* its one shared room. Multiple concurrent
  rooms for the same case aren't supported yet.
- No accounts — participants are anonymous per-browser sessions, not
  persistent identities across devices.
- No support for testing an arbitrary external website; every case is a
  small, local, deliberately-built fixture.

## The next-test algorithm

Each case ships a small, fixed set of **predefined candidate hypotheses**
(e.g. "express shipping alone causes rejection," "applying a promo code
causes rejection"), each a rule predicting whether a given condition
combination should fail. A hypothesis is "consistent" for as long as it
correctly predicts every experiment's actual pass/fail result so far.

For every untested combination, the algorithm computes its **expected
information gain**: the reduction in entropy (bits) of the still-consistent
hypothesis set, assuming a uniform prior, weighted by how many of those
hypotheses predict each of the test's two possible outcomes. The combination
with the highest expected gain is recommended, with ties broken toward
changing exactly one variable from the most recent experiment, then by a
fixed canonical order — so the same evidence always produces the same
recommendation.

This is a real, interpretable, unit-tested algorithm (`src/recommend.ts`,
`spec/recommend.test.ts`), not an LLM wrapper, and it makes no claim beyond
this fixed hypothesis set: if the true cause isn't one of the predefined
candidates, the algorithm says so rather than guessing. It also doesn't claim
to generalise to arbitrary websites or arbitrary bugs — it's scoped to the
small, enumerable condition space each built-in case defines.

`scripts/simulate-recommendations.ts` runs a deterministic offline comparison
against two baselines (a fixed canonical test order, and picking a random
untested combination) on the real checkout-failure fixture. On one concrete
run: the info-gain strategy needed 3 experiments to identify the true cause,
the fixed order needed 6, and random averaged ~4.8 over 200 seeded trials.
This fixture has only 8 combinations, which is far too small a space to
support a general statistical claim — it's one reproducible comparison on
one fixture, not a benchmark result.

## Stack

Plain Node.js (`node:http`, zero runtime npm dependencies) + `node:sqlite`
for persistence, Server-Sent Events for real-time sync, TypeScript run
directly via Node's type-stripping (no build step, no bundler). This is a
direct continuation of the Crit 8 stack decision (see `PROCESS.md`); Crit 9
added SSE for real-time delivery without introducing a new runtime
dependency, which is the specific reason SSE was chosen over WebSockets.

## Try it

https://comp4020-final-guangdeshi.fly.dev/
