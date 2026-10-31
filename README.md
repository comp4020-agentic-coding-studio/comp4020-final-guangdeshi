# Buy or Pass

**You want it. What does everyone else think?**

A COMP4020/COMP8020 Final Project, built across Crits 8–10 and refined for
submission as **v2.0** in direct response to tutor feedback (see
[`docs/product/TUTOR_FEEDBACK_RESPONSE.md`](docs/product/TUTOR_FEEDBACK_RESPONSE.md)).

> **Crit 9 → Final pivot.** This repo's Crit 8 submission was a different
> product, "Pick-Up Sticks," and Crit 9 pivoted to "Bug Relay"
> ([docs/adr/0001](docs/adr/0001-concurrent-investigation-evidence.md)).
> For the Final Project the product changed again, to Buy or Pass
> ([docs/adr/0002](docs/adr/0002-pivot-bug-relay-to-buy-or-pass.md)).

## What this is

A good purchasing decision depends not only on the product, but on the
person, their needs, and their circumstances. Buy or Pass is a social
shopping-opinion platform built on that claim: a user posts something
they're considering buying, with enough context for a stranger to give
relevant advice rather than a generic verdict. Other logged-in users give an
explicit 👍 Buy or 👎 Pass (or, for a head-to-head decision, pick one of 2-4
compared options) with one short honest comment. The buyer reads the
opinions and decides independently — there is no formal review process, no
aggregate verdict, and no judge.

## Who it's for

Anyone weighing a non-trivial purchase who wants advice that accounts for
*their* situation, not a generic star rating: a hiker deciding between
three sleeping bags for a specific cold-weather trip, a student picking a
laptop within a specific budget, or anyone wondering whether a "premium"
option is actually overspecified for what they'll really use it for.
Discover starts from a curated catalog of 72 real products with real photos
(Amazon Berkeley Objects, CC BY 4.0; see `/credits` and
`docs/research/PRODUCT_CATALOG_PROVENANCE.md`): pick one, add your own price
and situation, and ask. The catalog never supplies prices, ratings or
reviews. The 18 fictional demo scenarios from earlier development are kept,
clearly labelled, in the `/showcase` archive, not in Discover.

## Definition of good

**Good advice is relevant, honest, and easy to give. The purchase belongs
to the buyer. The opinions belong to the community.**

- **Human context, bounded.** A post can optionally answer up to 3
  category-specific prompts (what you already own, how you'll use it, your
  main concern) plus free text — enough for relevant advice, never an
  exhaustive questionnaire, and never a blank card for a skipped prompt.
- **Comparable choices, not invented scores.** A "Which One?" post compares
  2-4 real candidates with actual prices (including a struck-through
  original price and plain sale note where relevant) — never a computed
  discount ranking.
- **Honest data.** Demo content is clearly bannered as AI-generated
  fiction and structurally excluded from every real participation count.
- **Buyer agency.** No aggregate verdict exists anywhere in the schema. The
  buyer alone records Bought/Didn't Buy/Still Deciding, and may optionally
  mark which single opinion actually influenced them — never required, and
  never affecting anyone's vote count.
- **Historical learning, transparently.** Related past decisions surface via
  plain keyword search, not a ranking algorithm — see
  [docs/research/COMPETITIVE_DESIGN_ANALYSIS.md](docs/research/COMPETITIVE_DESIGN_ANALYSIS.md)
  for why that was a deliberate choice, not an omission.
- **Accountability, low friction, real-time co-presence** carry over
  unchanged from the original design: one current opinion per account per
  post (a database constraint), one stance plus one sentence, live updates
  within about a second.

## Stack

Plain Node.js 24 (`node:http`, `node:sqlite` including FTS5 search,
`node:crypto`), TypeScript via Node's built-in type-stripping, vanilla
browser JavaScript, Server-Sent Events, plus `sharp` and `busboy` for
verified image handling. See [PROCESS.md](PROCESS.md) and
[`docs/adr/`](docs/adr/) for the full reasoning behind every non-obvious
choice.

## Spec and checks

[`spec/`](spec/) exercises the testable parts of this Definition of Good —
comparison-mode voting rules, context-prompt rendering, demo/real
separation, the influential-opinion marker, and every pre-existing
Buy/Pass invariant — against a real running instance, not mocks. See
[`spec/README.md`](spec/README.md).
