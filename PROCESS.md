# Process

This describes the project as it stands. The complete earlier account,
including every incident, is kept in
[`docs/evidence/PROCESS_LOG.md`](docs/evidence/PROCESS_LOG.md). Passages
marked **[student]** are left for the student's own explanation.

## From brief to product

The repository carried three products:

- Pick-Up Sticks (Crit 8);
- Bug Relay (Crit 9, [ADR 0001](docs/adr/0001-concurrent-investigation-evidence.md));
- Buy or Pass ([ADR 0002](docs/adr/0002-pivot-bug-relay-to-buy-or-pass.md),
  [`719deed`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-guangdeshi/commit/719deed)).

Buy or Pass was built and verified as a separate prototype first. Before
migrating it, the old `HEAD` was recorded, a backup branch was pushed, and a
git bundle was made and restore-tested.

The tutor accepted the concept but called the response to the brief
underdeveloped. v2.0 answered with five additions:

- bounded category context;
- a "Which One?" comparison;
- keyword search over past decisions;
- labelled demo content;
- an optional "influenced my decision" marker.

They landed in
[`c865244`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-guangdeshi/commit/c865244),
[`a5a62b7`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-guangdeshi/commit/a5a62b7) and
[`5492bf0`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-guangdeshi/commit/5492bf0);
see [`TUTOR_FEEDBACK_RESPONSE.md`](docs/product/TUTOR_FEEDBACK_RESPONSE.md).

**[student]** Why this product, and why pivot twice rather than refine Bug
Relay.

## Stack

- **Plain Node 24, type-stripped TypeScript, no build step.** Carried from
  Crit 8.
- **`node:sqlite`.** One machine with one volume is the fixed deployment, so
  an embedded database fits. Synchronous access also makes the
  single-statement opinion upsert race-free in one process
  ([DATA_MODEL](docs/architecture/DATA_MODEL.md)).
- **Server-Sent Events, not WebSockets.** Every live event is
  server-to-client, and the client already posts forms.
- **`sharp` and `busboy`.** These are the only runtime dependencies, added
  for verified image upload.

The trade-off: the 256MB machine, not the development laptop, sets the
limits, and that mattered more than anything else (below).

**[student]** My position on the small-web sources from Crit 8, and the
product sources in the README, and how they shaped the choice above.

## Workflow and harness

Development uses one coding agent, held to [`CLAUDE.md`](CLAUDE.md):

- **Sections 1–12** are process rules carried from Crit 7
  ([`4183f5b`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-guangdeshi/commit/4183f5b)):
  - audit before acting;
  - a decision boundary;
  - verification before acceptance;
  - commit discipline.
- **Sections 13–30** are product constraints. Each points to an ADR or a
  test rather than restating it.

The agent proposes and implements. Product-value decisions and every push,
merge or deploy wait for the developer. v2.0 was developed on `feature/buy-or-pass-v2`,
and reached `main` in two merge commits.

Rather than adding agents or tooling, the harness changed when something
failed. Each case below names its trigger.

**[student]** Why one agent with a written harness, against the alternatives
weighed.

## What failed, and what changed

**Memory.** The first deploy crash-looped on OOM kills. scrypt's `N=131072`,
copied unexamined from the prototype, cost about 128MB per hash on a 256MB
machine, at every boot.

- The fix lowered N
  ([`7a14d4d`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-guangdeshi/commit/7a14d4d)).
- A unit test now caps the hash's memory cost.
- `CLAUDE.md` gained section 22.

Two weeks later, the same rule caught a second case that its own advice
had missed:

- Parallel `sharp` decodes took a local server from about 135MB to about
  580MB for one four-WebP post.
- The demo seeder reached about 375MB.
- `--max-old-space-size` could not have shown either, because `sharp`'s
  buffers sit outside the V8 heap.

A process-wide decode slot brought these to about 250MB and 195MB
([`4e1674b`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-guangdeshi/commit/4e1674b)),
and section 22 now asks for measured RSS. These are macOS figures, not
Fly's.

**Real-time.** A two-browser audit on 2026-11-03 found that only votes met
the one-second bar. New questions, edits, outcomes, influential marks and
deletions all needed a reload.

The fix sends id-only events and has each page refetch its own
server-rendered live regions
([`8911295`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-guangdeshi/commit/8911295),
[ADR 0005](docs/adr/0005-realtime-event-contract.md)). Section 29 makes this
cover every shared change. `scripts/verify-realtime.mjs` keeps two browsers
open at 1440×900 and 390×844 across the whole matrix, which includes:

- offline and reconnect;
- six concurrent voters.

**Test contamination.** During that audit a test run aimed at the wrong port
wrote test accounts into the preview database. The spec and every
account-creating script now refuse any target that doesn't report itself
disposable, and `verify-admin` needs an explicit database path
([`6214d4a`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-guangdeshi/commit/6214d4a);
section 30).

**Packaging.** The v2.0 merge failed CI and never deployed. `src/server.ts`
imported the demo seeder, but the Dockerfile copied only `src/`. Every local
run used the whole working tree, so nothing before CI had exercised the
image.

The Dockerfile now ships the seeder and its photos
([`0345862`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-guangdeshi/commit/0345862)).
Section 5 now separates typecheck, spec, real-browser, container and
production evidence, and forbids reporting one as another. With no local
container runtime, the fix was checked against a directory holding exactly
the image's file set. That reproduced the crash without the seeder and
passed the spec with it.

Earlier, browser testing alone caught two v2.0 bugs that typecheck and the
spec missed ([`a5a62b7`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-guangdeshi/commit/a5a62b7)):

- a mode selector outside its `<form>`;
- a multipart field limit silently dropping fields.

**[student]** Which of these changed how I work, rather than just the code.

## Verification, and what it does not show

Production checks:

- The fix merge
  ([`611c9b6`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-guangdeshi/commit/611c9b6))
  passed CI, which builds the image and runs the spec against it, and
  deployed as Fly release v8.
- Two live browsers saw updates in 96–179ms.
- Server RSS was about 105MB.
- Data survived a machine restart.

On 2026-11-07, against a disposable local instance of the current working
tree:

- typecheck: clean;
- spec: 207 of 207;
- `check:evidence`: passing;
- `verify-realtime`, `verify-browser`, `verify-admin` and `verify-catalog`:
  all passed.

The working tree includes an uncommitted double-submit guard. Its Slow 3G
check reproduced 5 duplicate posts in 5 attempts without the guard, and 0
with it.

What none of this shows is the judged half of the README:

- whether context makes advice more relevant;
- whether one sentence is easy to give;
- whether buyers keep ownership.

[`HUMAN_EVALUATION_PROTOCOL.md`](docs/product/HUMAN_EVALUATION_PROTOCOL.md)
is prepared but has not been run. A scripted prototype of a lower-friction
decision flow was tried outside the repo and deliberately not built before
the deadline. Fictional personas are not user evidence.

The C10 log rehearsal was two automated browser profiles, not a classroom
demonstration.

**[student]** What I would test with real people first, and why.
