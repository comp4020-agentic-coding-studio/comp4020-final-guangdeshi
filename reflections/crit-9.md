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

Verification: `pnpm check` (46 tests: typecheck + unit tests for the
fixture/algorithm + HTTP-level tests against a running instance, covering
persistence across reload, two independent participants, concurrent and
duplicate submissions, reveal/reset, and SSE delivery), the same checks
against the built Docker image CI uses, and real-browser verification with
two independent browser contexts against the same room (see `PROCESS.md` for
exact findings and any caveats).

## What was the breakthrough that moved the work forward?

*(Left for the student's own words — this is the part no account written on
their behalf can honestly fill in. The implementation record above is the
factual basis to reflect against; the breakthrough itself was a moment of
understanding, not a line of code, and isn't something to infer or invent
here.)*

## What did this work change about who I want to be as a software developer?

*(Also left for the student. One prompt worth considering while writing it:
this crit required naming and defending a concurrency decision — "which
updates propagate live, how do simultaneous submissions get handled" — that
has no single correct answer, only trade-offs weighed against this project's
own stated Definition of Good. What did making and defending that kind of
call, rather than a purely technical one, change about how you think about
this work?)*
