# Process

This describes the project as it stands. The complete earlier account,
including every incident, is kept in
[`docs/evidence/PROCESS_LOG.md`](docs/evidence/PROCESS_LOG.md).

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

Why I moved away from Bug Relay: the idea was to let developers reproduce
bugs and help each other work out what went wrong. I still think that is
useful, but real bugs depend a lot on each person's development
environment, and it is hard to recreate all those situations on one
website. Bug Relay had one fixed checkout bug. Its reproduction flow was
also awkward to use, even though the features were implemented. With coding
agents becoming more common, I also started to question how much extra value
a site like that would add. That was my concern about the product, not a
measured trend.

Buying decisions are something many more people can relate to. People can
give an opinion from their own experience, without a particular setup or
specialist knowledge. That is why I moved to Buy or Pass rather than keep
refining Bug Relay.

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

The trade-off: the 256MB production machine, not the development laptop,
sets the limits. That became a major constraint (see "What failed").

These choices were carried over from Crit 8, whose README already cited
small-web writing
([`f89a449`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-guangdeshi/commit/f89a449)). Reading Satyal and Hoyt again for the final README helped me
evaluate the choices afterwards; I don't claim the articles caused them.

I agree that a website doesn't have to become a large platform to be
useful. It can focus on one problem and do that well. For Buy or Pass I care
more about people getting useful, honest opinions than about the site
looking busy. That is the part of Satyal's argument that fits, and why there
is no fake engagement, no invented rating and no algorithm telling people
what to buy. Hoyt's case for simple software matches the technical approach
above.

But I don't think small or simple automatically makes a website good. If
people are going to use it, it still needs proper accounts, data that
persists, and reliable real-time updates. Sloan's home-cooked app is an
interesting argument, but it is built for a few family members. Buy or Pass
depends on a community of strangers, so it needs accounts, server-side
permission checks and moderation tools that a family app can skip.

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

I kept using Claude Code with the existing `CLAUDE.md` because the project
kept changing, and I wanted the important rules and decisions in one place.
Without written rules I would have to explain the same things again and
again, and the agent could miss something important. The same file has
carried forward since Crit 8 (and before that from Crit 7), through two
product changes.

I did not run a proper comparison between a single agent and a multi-agent
setup, so I don't claim one is better. Multiple agents might help, but they
would add coordination and complexity, and keeping the existing workflow was
a reasonable choice for this project. I also wanted product decisions, Git
pushes, merges and production deployments to stay under my control, because
mistakes there could affect real data or the final product.

The harness was not designed as a minimal system from the start. Most of
sections 13–28 came in with the product and its design decisions. The
changes below were responses to failures I actually hit: section 22 after
the memory crash, 29 and 30 after the real-time audit, and the verification
levels in section 5 after the release failure.

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
open, one on a phone viewport, across the whole matrix, which includes:

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

What changed how I work with the agent started earlier, with Bug Relay. An
agent can implement the features I describe and the result can still be hard
to use. The bug reproduction flow existed, but going through its steps felt
awkward and didn't work the way I had imagined. Part of that was because I
hadn't explained the interaction clearly enough. I learned that I can't just
describe an idea and accept the result because the agent says it is
finished. I need to open the website, try the actual interactions, and see
whether they work for a real user. The real-time and deployment failures
above reinforced that lesson. The real-time gaps showed up with two browsers
open side by side, and the packaging failure only when CI ran the actual
image.

## Verification, and what it does not show

Production checks:

- The fix merge
  ([`611c9b6`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-guangdeshi/commit/611c9b6))
  passed CI, which builds the image and runs the spec against it, and
  deployed as Fly release v8.
- Two live browsers saw updates in 96–179ms.
- Server RSS was about 105MB.
- Data survived a machine restart.

Two additions came from the last acceptance runs:

- A slow-network run found that a double-click on "Publish post" over
  Chrome's Slow 3G profile created two posts, 5 times in 5 attempts. Each
  POST form now submits once: 0 duplicates in 5
  ([`9016912`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-guangdeshi/commit/9016912)).
- `spec/buyer-decides.test.ts` checks that a lopsided vote never becomes an
  outcome, and that the buyer can decide against the majority
  ([`60fab79`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-guangdeshi/commit/60fab79)).

On 2026-11-08, against a disposable local instance:

- typecheck: clean;
- spec: 210 of 210;
- `check:evidence`: passing;
- `verify-browser`, `verify-admin` and `verify-catalog`: all passed;
- `verify-realtime`: passed with the desktop browser at 1440×900, and again
  at the marking viewport of 1920×1080 beside 390×844
  ([`8d8f744`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-guangdeshi/commit/8d8f744)),
  with an end-to-end maximum under 90ms.

These are localhost timings.

What none of this shows is the judged half of the README:

- whether the opinions help someone decide;
- whether context makes advice more relevant;
- whether one sentence is easy to give.

[`HUMAN_EVALUATION_PROTOCOL.md`](docs/product/HUMAN_EVALUATION_PROTOCOL.md)
is prepared but has not been run. A scripted prototype of a lower-friction
decision flow was tried outside the repo with fictional personas; it was not
implemented before submission, and fictional personas are not user evidence.

The C10 log rehearsal was two automated browser profiles, not a classroom
demonstration.

What I most want to find out with real users is whether Buy or Pass
actually helps people make purchasing decisions. Not only whether they can
click Buy or Pass, but whether the opinions help them understand their
options, feel less uncertain, and decide with less effort. I also want to
see whether old discussions are useful to someone looking at the same or a
similar product. Passing automated tests cannot show any of this, and none
of it has been tested with people yet.
