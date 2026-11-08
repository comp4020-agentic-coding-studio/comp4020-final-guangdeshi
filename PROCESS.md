# Process

The full earlier account, with every incident and measurement, is in
[`docs/evidence/PROCESS_LOG.md`](docs/evidence/PROCESS_LOG.md).

## From brief to product

The repository carried three products: Pick-Up Sticks (Crit 8), Bug Relay
(Crit 9, [ADR 0001](docs/adr/0001-concurrent-investigation-evidence.md)) and
Buy or Pass ([ADR 0002](docs/adr/0002-pivot-bug-relay-to-buy-or-pass.md),
[`719deed`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-guangdeshi/commit/719deed)).

Bug Relay was meant to let developers reproduce bugs and help each other work
out what went wrong. I still think the idea is useful, but real bugs depend a
lot on each person's development environment, and one shared website can't
really recreate those situations. Bug Relay only had one fixed checkout bug,
and its reproduction flow was awkward to use even though the features were
implemented. With coding agents becoming more common, I also doubted how
much extra value a site like that would add. That was my own concern, not a
measured trend. Buying decisions are something many more people can relate
to, and anyone can give an opinion from their own experience without a
special setup or knowledge.

Buy or Pass was built and checked as a separate prototype first, and
migrated only after a backup branch and a restore-tested git bundle. The
tutor then called the response to the brief underdeveloped, and v2.0 added
category context, a "Which One?" comparison, search over past decisions,
labelled demos and an "influenced my decision" marker
([`c865244`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-guangdeshi/commit/c865244);
[response](docs/product/TUTOR_FEEDBACK_RESPONSE.md)).

## Stack

Plain Node 24 with type-stripped TypeScript and no build step, carried from
Crit 8. `node:sqlite` fits the fixed one-machine, one-volume deployment and
keeps the opinion upsert race-free
([DATA_MODEL](docs/architecture/DATA_MODEL.md)). Server-Sent Events rather
than WebSockets, because every live event goes server to client. The
trade-off is that the 256MB production machine, not my laptop, sets the
limits, and that became a major constraint.

These choices came before the final README. Crit 8's README already cited
small-web writing
([`f89a449`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-guangdeshi/commit/f89a449)),
and reading Satyal and Hoyt again helped me evaluate the choices afterwards;
I don't claim the articles caused them.

I value software that solves one real problem well without chasing
engagement or complexity. For Buy or Pass I care more about people getting
useful, honest opinions than about the site looking busy, which is the part
of Satyal's argument that fits, and Hoyt's case for simple software matches
the stack. But simplicity shouldn't cost necessary things. If people are
going to use the site, it needs proper accounts, data that persists and
reliable real-time updates. Sloan's home-cooked app is built for a few family
members; Buy or Pass depends on strangers, so it needs accounts, server-side
permission checks and moderation tools a family app can skip.

## Workflow and harness

I kept using Claude Code with the existing [`CLAUDE.md`](CLAUDE.md) because
the project kept changing, and I wanted the important rules and decisions in
one place. Without written rules I would have to explain the same things
again, and the agent could miss something important. Sections 1–12 are
process rules carried from Crit 7
([`4183f5b`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-guangdeshi/commit/4183f5b)),
through both product changes. Sections 13–30 are product constraints.

I did not compare a single agent with a multi-agent setup, so I don't claim
one is better. Multiple agents might help, but they add coordination and
complexity, and keeping the existing workflow was reasonable here. I wanted
product decisions, pushes, merges and deployments to stay under my control,
because mistakes there affect real data or the final product.

The harness was not designed as a minimal system from the start. Most of
sections 13–28 came in with the product. The changes below came from
failures I actually hit.

## What failed, and what changed

**Memory.** The first deploy crash-looped on out-of-memory kills: scrypt
settings copied unexamined from the prototype cost about 128MB per hash on a
256MB machine, at every boot. Lowering it
([`7a14d4d`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-guangdeshi/commit/7a14d4d))
came with a unit test capping the cost and a new `CLAUDE.md` section 22. Two
weeks later that rule caught parallel image decodes using several hundred
MB locally. One
decode at a time fixed it
([`4e1674b`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-guangdeshi/commit/4e1674b)),
and section 22 now asks for measured process memory.

**Real-time.** A two-browser audit found that only votes updated live; new
questions, edits, outcomes and deletions needed a reload. Pages now refetch
their own server-rendered regions on id-only events
([`8911295`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-guangdeshi/commit/8911295),
[ADR 0005](docs/adr/0005-realtime-event-contract.md)), section 29 covers
every shared change, and `scripts/verify-realtime.mjs` keeps two browsers
open across the whole matrix.

**Test contamination.** During that audit a test run aimed at the wrong port
wrote test accounts into the preview database. Tests now refuse any non-disposable
target
([`6214d4a`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-guangdeshi/commit/6214d4a);
section 30).

**Packaging.** The v2.0 merge failed CI and never deployed: the server
imported a script the Dockerfile didn't copy, and every local run used the
whole working tree. Fixed in
[`0345862`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-guangdeshi/commit/0345862).
Section 5 now separates typecheck, spec, browser, container and production
evidence.

What changed how I work with the agent started earlier, with Bug Relay. An
agent can implement the features I describe and the result can still be
hard to use. Its reproduction flow existed but felt awkward, partly because
I hadn't explained the interaction clearly enough. I learned that I can't
accept a result because the agent says it is finished; I need to try the
actual interactions and see whether they work for a real user. The failures
above reinforced that: the real-time gaps showed up with two browsers side
by side, and the packaging failure only when CI ran the real image.

## Verification, and what it does not show

CI builds the image, runs the spec against it and deploys; after the
release fixes
([`611c9b6`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-guangdeshi/commit/611c9b6)),
two live browsers saw updates in under 200ms and data survived a restart.
Locally, against a disposable instance, the 210-test spec and four browser
scripts pass, including the real-time check at the marking viewports of
1920×1080 and 390×844
([`8d8f744`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-guangdeshi/commit/8d8f744)).
Late additions stopped a Slow 3G double-click creating a duplicate post
([`9016912`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-guangdeshi/commit/9016912))
and test that a majority vote never becomes the buyer's outcome
([`60fab79`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-guangdeshi/commit/60fab79)).

None of this shows the judged half of the README. What I most want to find
out with real users is whether Buy or Pass actually helps people make
purchasing decisions: not only whether they can click Buy or Pass, but
whether the opinions help them understand their options, feel less
uncertain and decide with less back-and-forth. I also want to see whether
old discussions help someone looking at the same or a similar product. That
is a proposed evaluation;
[`HUMAN_EVALUATION_PROTOCOL.md`](docs/product/HUMAN_EVALUATION_PROTOCOL.md)
is prepared but has not been run. A lower-friction flow was prototyped
outside the repo with fictional personas, which are not user evidence, and
was not implemented before submission.
