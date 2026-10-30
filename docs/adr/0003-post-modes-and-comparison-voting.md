# ADR 0003: Post modes and comparison voting (Buy or Pass v2.0, Feature B)

## Status

Accepted — v2.0 response to tutor feedback.

## Context

The tutor's review of the original Buy or Pass concept accepted the core
idea but flagged it as underdeveloped: a single product with a binary
👍/👎 doesn't cover the common real case of "I'm choosing between two or
three specific things, which one?" (the tutor's own example: two sleeping
bags at different price points). Buy or Pass needed a second way to ask for
advice — comparing 2-4 concrete candidate products — without breaking any
of the existing Buy/Pass behavior, data, or tests.

Two existing invariants constrain the design:

- **One current opinion per (post, user)**, enforced by a real `UNIQUE
  (post_id, user_id)` constraint and a single `INSERT ... ON CONFLICT DO
  UPDATE` statement (`docs/architecture/DATA_MODEL.md`, CLAUDE.md rule 15).
  Whatever a comparison opinion looks like, it has to fit the same
  single-statement upsert pattern — no "check then insert" race
  reintroduced.
- **Never fabricate counts** (CLAUDE.md rule 16). A comparison post's
  per-option counts must be computed live from real rows, the same as
  Buy/Pass counts always have been.

## Decision

**A post gets an explicit `post_mode` column (`BUY_PASS` | `WHICH_ONE`),
defaulting every existing row to `BUY_PASS`.** A `WHICH_ONE` post owns 2-4
rows in a new `purchase_options` table. An opinion on a `WHICH_ONE` post
selects exactly one `purchase_option` or explicitly "none of these" —
represented as a three-way discriminated shape on the existing `opinions`
table, not a new opinions-for-comparison table.

Concretely (`src/migrations.ts`):

- `0003_post_modes_and_options`: `posts.post_mode TEXT NOT NULL DEFAULT
  'BUY_PASS' CHECK (post_mode IN ('BUY_PASS','WHICH_ONE'))`. The `DEFAULT`
  is what satisfies "every existing post is treated as BUY_PASS" — no
  backfill script touches a single existing row. `purchase_options` has a
  `CHECK (position BETWEEN 0 AND 3)` and `UNIQUE (post_id, position)`,
  structurally impossible to exceed 4 options per post even before
  application-level validation runs.
- `0004_opinions_comparison_support`: `opinions.stance` becomes nullable,
  and two new columns are added — `selected_option_id` (nullable FK to
  `purchase_options`) and `selected_none` (`0`/`1`). A `CHECK` constraint
  enforces that exactly one of three shapes holds: `stance` set and the
  other two unused; `selected_option_id` set and the other two unused; or
  `selected_none = 1` and the other two unused. No row can ever be a
  Buy/Pass vote AND a comparison selection, or neither.

  `node:sqlite`'s `ALTER TABLE` cannot relax an existing `CHECK` constraint
  in place, so this migration is a full table rebuild (create
  `opinions_new`, copy every row forward with `selected_option_id = NULL,
  selected_none = 0`, drop the old table, rename) inside the migration
  runner's existing transaction. This was verified directly — a throwaway
  `node:sqlite` script with `PRAGMA foreign_keys = ON` confirmed the
  rebuild completes cleanly and preserves every existing row's `stance`,
  `comment`, and timestamps — before committing to the approach, not
  assumed from the SQLite documentation alone.

- Two upsert functions exist in `src/db.ts`: `upsertOpinion` (unchanged
  signature and behavior for Buy/Pass — explicitly zeroes the two new
  columns on every call, so a defensive path back to Buy/Pass can never
  leave a stale selection behind) and `upsertComparisonOpinion` (same
  `INSERT ... ON CONFLICT DO UPDATE` pattern, same `UNIQUE (post_id,
  user_id)` guarantee, same concurrency story as the original). Counts
  split the same way: `getOpinionCounts` gained an explicit `AND stance IS
  NOT NULL` guard so a comparison selection can never leak into a Buy/Pass
  tally, and a new `getOptionCounts` groups by `selected_option_id` plus a
  separate "none" count.

- **Server-side rules, enforced in `src/server.ts`, not just hidden in the
  UI**: a `BUY_PASS` post rejects a `selectedOptionId` field (400); a
  `WHICH_ONE` post rejects a `stance` field (400); selecting an option id
  is only accepted after loading the real `PurchaseOption` row and checking
  `option.postId === postId` — a fabricated id or a real id belonging to a
  *different* post is rejected (400), never trusted from the client. The
  existing "an author cannot opine on their own post" rule applies
  identically to both modes, checked once before branching.

## Alternatives considered

**A. A separate `comparison_opinions` table, parallel to `opinions`.**

Rejected: it would duplicate the `UNIQUE (post_id, user_id)` constraint,
the upsert-concurrency pattern, and every query site that currently reads
"the viewer's opinion on this post" (profile page, post detail, SSE
broadcast) would need an `if (post.mode === ...)` branch at the *table*
level instead of the *row-shape* level. Keeping one `opinions` table with a
discriminated shape means most of that code (fetching a user's opinion,
listing opinions for a post, deleting an opinion) didn't need to change at
all — only the three functions that actually interpret the stance/selection
fields did.

**B. Letting a `WHICH_ONE` opinion carry an aggregate numeric rating per
option instead of a single pick.**

Rejected as scope creep beyond what the tutor's feedback actually asked
for (the worked example was "which one," a single choice, not "score each
on a 1-5 scale") — and it would reintroduce exactly the "fabricated-looking
precision" problem the Definition of Good already rejects for the
Buy/Pass side (no star ratings, no collapsed aggregate score).

**C. Up to 10 comparison options instead of capping at 4.**

Rejected per the user's own approved comparison-UI scope ("Desktop: 2-4
product cards side by side... Avoid a very long vertical list"). Four is
both a UI constraint (CSS Grid/scroll-snap cards stay legible) and a
decision-quality constraint — comparing more than a handful of concrete
options at once works against "easy to give" advice, not for it.

## Consequences / drawbacks

- `purchase_options` and the new `opinions` columns add real schema
  surface that every future opinion-related query must be aware of (the
  `AND stance IS NOT NULL` guard is easy to forget in a new query —
  `spec/comparison.test.ts`'s "never lets a comparison selection inflate a
  Buy/Pass count" test exists specifically to catch a regression here).
- `setPurchaseOptions` always deletes and re-inserts a post's full option
  list on edit (`ON DELETE CASCADE` cleans up old option rows, including
  any opinions pointing at them). This means editing a `WHICH_ONE` post's
  options resets every existing comparison opinion's `selected_option_id`
  to a dangling reference that cascades to deleting the opinion entirely —
  acceptable for this project's scope (editing a comparison post's options
  after people have already voted is not a supported "preserve votes"
  flow), but worth stating explicitly rather than leaving it implicit.
- Two upsert functions and two count functions is slightly more surface
  than a single polymorphic one would be, in exchange for each function
  staying simple enough to read in one pass and for the Buy/Pass path
  remaining byte-for-byte unchanged in behavior — judged worth it given
  "don't regress the 75 existing tests" was a hard constraint.

## When to revisit

- If a future feature needs a comparison opinion to carry more structure
  than "one pick + one comment" (e.g. per-option pros/cons), the
  discriminated-shape-on-one-table design would likely need to become
  Alternative A (a separate table) at that point, since the single-table
  shape only really works while the comparison opinion stays this simple.
- If `purchase_options` editing needs to preserve existing votes across an
  edit (e.g. only changing a price, not replacing the whole option list),
  `setPurchaseOptions`'s delete-and-recreate approach would need to become
  a real diff/update instead.
