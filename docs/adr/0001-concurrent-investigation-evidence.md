# ADR 0001: Concurrent investigation evidence is append-only

## Status

Accepted — Crit 9.

## Context

Bug Relay's shared evidence board can receive submissions from more than one
participant at (or very close to) the same moment: two investigators each
running an experiment in the same room within the same second. The app needs
one consistent rule for what happens when that occurs, and it needs to be a
rule that holds up to the pod arguing for the rejected alternative at the
crit.

README.md's Definition of Good states, among other things:

> Results can be repeated. [...] New evidence updates the shared investigation
> state immediately. [...] The system does not claim a definitive root cause
> from insufficient evidence.

Any concurrency rule has to be judged against those three lines specifically,
not against general database-design taste.

## Decision

**Experiments are append-only, server-timestamped records. Every submission
is retained — including two simultaneous submissions of different
combinations, and including an exact duplicate of a combination someone else
(or the same person) already tried.** Nothing about a new submission ever
overwrites or silently merges into an existing row.

Concretely:

- `experiments` (`src/db.ts`) has no `UPDATE` or `DELETE` path for an
  individual row in normal operation — only `INSERT` (`recordExperiment`) and
  a deliberate, explicit, whole-case `resetCase`, which is its own labelled
  product action, not a side effect of ordinary submission.
- Every row gets a server-assigned `AUTOINCREMENT` id and a server
  `created_at` timestamp — never a client-supplied id or time — so two
  requests that race can never collide on identity or ordering.
- The evidence board and the hypothesis/recommendation state
  (`src/recommend.ts`) are **recomputed from the full persisted experiment
  list on every read**. There is no separately-stored "current best
  hypothesis" or "current coverage" field that a write updates incrementally;
  a GET or an SSE broadcast always derives its answer fresh from
  `getExperiments(caseId)`. This means a repeated/duplicate submission is
  never discarded as noise — it's counted, and shown as a labelled repeat
  (`repeat 2/2` etc. in the evidence table), because repetition is itself
  evidence that a result reproduces.
- Correctness under concurrent requests to the same room relies on two
  properties of the existing stack rather than an added locking layer:
  Node's single-threaded event loop serializes the handling of each
  request's synchronous body, and `node:sqlite`'s `DatabaseSync` calls used
  here (`run`, `get`, `all`) are themselves synchronous. So within one
  request handler, "read current state → insert → read updated state" cannot
  be interleaved with another request's handler; two concurrent POSTs are
  simply processed as two back-to-back inserts, each getting its own
  autoincrement id. This is why `spec/bug-relay.test.ts`'s concurrent-POST
  test (`Promise.all` of two submissions) asserts "both rows exist," not
  "exactly one wins."

## Alternatives considered

**A. A single mutable "current leading hypothesis" record**, updated whenever
new evidence shifts the best guess, with individual experiments kept mainly
as a log for display.

Rejected because it fails the Good definition directly: it collapses
"results can be repeated" into a single derived opinion, which means a
duplicate confirming result and a duplicate contradicting result would
compete to overwrite the same field instead of both being visible as
evidence. It also pushes toward "the system does claim a definitive cause"
sooner than the evidence actually supports, since a mutable "current best"
field invites being read as an answer rather than a running summary.

**B. Last-write-wins / de-duplicate identical submissions.**

Rejected because "two simultaneous unique submissions are both retained" and
"identical submissions are not silently discarded" are both explicit
requirements this project set for itself (mirroring the brief), and because
repeated coverage of the same combination is meaningful in this domain
specifically — a bug that reproduces 3/3 times is a stronger result than one
that reproduced once, and silently dropping the repeats would erase that
signal.

## Consequences / drawbacks

- The evidence table has no upper bound and nothing currently ages it out; a
  long-running room for a popular case would grow its `experiments` table
  indefinitely. Acceptable at this project's scale (a course-crit fixture
  with a handful of built-in cases and modest concurrent use), but a real
  product would need a retention or archiving story.
- Recomputing the recommendation from the full experiment list on every read
  is O(n) in the number of recorded experiments (and the simulation script,
  `scripts/simulate-recommendations.ts`, re-evaluates it once per step). For
  this case's realistic evidence volumes (tens, not thousands, of rows per
  room) this is effectively instant; it would need revisiting if evidence
  volume grew by orders of magnitude.
- Relying on the Node event loop + synchronous SQLite calls for
  concurrency-safety (rather than a database transaction or an explicit
  lock) is a real coupling to the current stack. It would need revisiting if
  the app ever moved to multiple server processes/machines sharing one
  database — `fly.toml` currently runs exactly one machine
  (`min_machines_running = 0`, `[[vm]] size = "shared-cpu-1x"`), so this
  isn't the case today, but it's the concrete condition that would break the
  assumption.

## When to revisit

- If evidence volume per room grows large enough that recomputing the
  recommendation on every read becomes a visible latency problem.
- If the app ever scales to more than one server process/machine sharing the
  database, at which point "the event loop serializes it" stops being true
  and an explicit transaction or lock would be needed.
- If a future case's domain makes "every duplicate is meaningful evidence"
  false — e.g. a case where exact duplicate submissions are genuinely noise
  rather than signal — at which point de-duplication might need to become
  per-case policy rather than a blanket rule.
