# Crit 9 Reflection

## Implementation evidence (factual account)

For Crit 9, the project pivoted from Crit 8's product (Pick-Up Sticks) to
**Bug Relay**, a real-time collaborative bug-investigation tool, per the
Final Project brief's direction that the project should keep evolving toward
its actual final shape rather than stay a one-off weekly exercise. The pivot
itself — not just the C9 feature work — is the main decision this crit
records; it's written up in `PROCESS.md`.

What shipped: one complete investigation case (Checkout Failure) with a real
deterministic fixture bug, persistent SQLite-backed evidence, Server-Sent
Events for real-time sync (a new experiment, a reset, or a presence change
reaches every other open session in roughly a second, without a reload),
anonymous but distinguishable participants, a unit-tested next-test
recommendation algorithm (expected information gain over a fixed hypothesis
set), and a documented concurrency policy
(`docs/adr/0001-concurrent-investigation-evidence.md`): evidence is
append-only, duplicates are retained and labelled rather than discarded, and
the recommendation is always recomputed from the full persisted record.

Verification: `pnpm check` (31 tests: typecheck + unit tests for the
fixture/algorithm + HTTP-level tests against a running instance, covering
persistence across reload, two independent participants, concurrent and
duplicate submissions, reveal/reset, and SSE delivery), the same checks
against the built Docker image CI uses, and real-browser verification with
two independent browser contexts against the same room (see `PROCESS.md` for
exact findings and any caveats).

## What was the breakthrough that moved the work forward?

By Crit 9, Bug Relay worked: two people could investigate the same bug in
real time. One important design decision was to keep evidence append-only,
so when two people submit results at the same moment, both are kept rather
than one overwriting the other.

But building it made me question whether it was the right final product.
The debugging workflow needed specialised knowledge, making the interaction
meaningful took more complexity than I expected, and people without a
programming background would struggle to use it.

The breakthrough was recognising that technical complexity does not
necessarily make a project more valuable. Instead of expanding Bug Relay, I
started looking for a more accessible, everyday problem. After this crit,
that led to the pivot to Buy or Pass, because almost everyone makes
purchasing decisions and can offer opinions from their own experience.

## What did this work change about who I want to be as a software developer?

This crit changed how I see my role with a coding agent. Claude implemented
much of the code, including the server, schema, SSE connection and tests,
and found the mobile overflow bug by opening the page at phone width. My
responsibility was to make and justify the design decisions, rather than
simply accepting the agent's implementation. These included dropping
Pick-Up Sticks, building one case properly instead of several half-finished
ones, keeping every experiment record, and later questioning Bug Relay
itself. I also had to verify the results by reading the tests and checking
the screenshots, rather than trusting that the work was done.

It also showed me that finding a genuinely useful problem can be harder than
implementing a solution. I don't think every project has to change the
world, but I want to build software with a clear practical reason to exist,
and I now see finding that reason as part of the work.
