# Buy or Pass

**You want it. What does everyone else think?**

A COMP4020/COMP8020 Final Project, built across Crits 8–10.

> **Crit 9 → Final pivot.** This repo's Crit 8 submission was a different
> product, "Pick-Up Sticks," and Crit 9 pivoted to "Bug Relay" (see the
> history below `0def73b`/`a9e148c` and `docs/adr/0001-concurrent-
> investigation-evidence.md`). For the Final Project the product changed
> again, to Buy or Pass; the decision, what carried forward, and what
> didn't are recorded in `docs/adr/0002-pivot-bug-relay-to-buy-or-pass.md`
> and `PROCESS.md`. Git history, the Fly.io app, and the stack/persistence
> conventions carried forward; the product code did not.

## What this is

Buy or Pass is a social shopping-opinion platform. A user posts something
they're thinking about buying — photos, price, and why they're considering
it — and other logged-in users give a quick, explicit 👍 Buy or 👎 Pass with
one short honest comment. The original poster reads the opinions and decides
for themselves whether to buy. They can later come back and record whether
they actually bought it. This is deliberately not a shopping court: there is
no formal review process, no blind voting phase, no automatic verdict, and
no judge. It's a fast, low-friction way to ask people you trust (or a
community of strangers) "would you get this?"

## Who it's for

Anyone weighing a non-trivial purchase who wants a second (or tenth) opinion
faster than posting in a group chat and waiting — students comparing a
purchase against their budget, hobbyists deciding between gear, or anyone who
just wants to know if they're about to make an obviously bad call.

## Definition of good

**Good advice is relevant, honest, and easy to give.**
**The purchase belongs to the buyer. The opinions belong to the community.**

This governs every design decision in the app:

- **Low friction** — a visitor understands what to do within seconds of
  landing on the homepage; giving an opinion is one stance, one sentence, one
  button.
- **Clear position** — every opinion carries one explicit, visible stance
  (BUY or PASS). There is no vague "maybe," because a wishy-washy opinion
  isn't useful to the person deciding.
- **Human context** — every post explains the buyer's intended use, not just
  a product photo, so opinions can be about fit-for-purpose, not just taste.
- **Accountability** — each account has at most one *current* opinion per
  post, enforced by a database constraint, not just UI convention. Changing
  your mind replaces your old opinion; it doesn't let you stack votes.
- **Buyer agency** — nobody, including the platform, decides the purchase
  for the author. There is no aggregate "verdict," no AI recommendation, and
  no majority-rules outcome banner. Counts are shown as raw counts.
- **Real-time social value** — a new opinion and updated counts appear on an
  open post page within about a second, without the viewer refreshing.
- **Honest results** — counts reflect real submitted opinions. The platform
  never fabricates votes, reviews, or activity to make a post look more
  popular than it is.
- **Relevance without gatekeeping** — a user's declared interests can surface
  more relevant posts to them (see the Recommendation roadmap below), but no
  one is prevented from giving an opinion because they lack a badge or
  "expertise" credential. An honest opinion from an outsider is still a real
  opinion.

### What this explicitly is not

Per the product brief, this is **not** a shopping court: no compulsory
questionnaires, no independent blind-voting phase, no formal debate rounds,
no challenge rounds, no multi-stage review pipeline, no artificial judge, no
automatic purchase verdict, no mandatory voting deadline, and no AI purchase
advisor. An opinion is one stance and one sentence, full stop.

## Core user journey

1. Discover public purchasing questions on the Discover feed.
2. Register or log in.
3. Create a post: 1–4 photos, a title, optional price/currency, a category,
   optional tags, and a short note on why you're considering it.
4. Publish — public (appears in Discover) or unlisted (link-only).
5. Another logged-in user opens the post.
6. They pick 👍 Buy or 👎 Pass and write one short comment.
7. They submit. The author and any other open viewers see the new opinion
   and updated counts live, without refreshing.
8. The author decides independently whether to buy.
9. Later, optionally, the author records Bought / Didn't Buy / Still
   Deciding, with an optional short reflection.

Post authors do not vote on their own posts (enforced server-side, not just
hidden in the UI) — see
[docs/architecture/AUTH_AND_PERMISSIONS.md](docs/architecture/AUTH_AND_PERMISSIONS.md)
for why.

## Stack and why

Plain Node.js 24 (`node:http`, `node:sqlite`, `node:crypto`), TypeScript run
directly via Node's built-in type-stripping (no build step, no bundler),
vanilla browser JavaScript, and Server-Sent Events for real-time updates —
the same conventions this repository already used for Bug Relay. Two small,
actively maintained npm dependencies — `sharp` (image decoding, re-encoding
and metadata stripping) and `busboy` (multipart form parsing) — are new in
this pivot, because correct, security-reviewed image/upload handling is
worth a real dependency rather than a hand-rolled parser; nothing else
needed a framework. See [PROCESS.md](PROCESS.md),
[docs/adr/0002-pivot-bug-relay-to-buy-or-pass.md](docs/adr/0002-pivot-bug-relay-to-buy-or-pass.md),
and [docs/architecture/](docs/architecture/) for the full reasoning.

## Important constraints and honest limitations

- **Single-machine deployment target.** The course's Fly.io environment
  constraint (one machine, one SQLite volume) means rate limiting and SSE
  broadcast state live in a single Node process's memory. This is documented,
  not hidden, in
  [docs/architecture/AUTH_AND_PERMISSIONS.md](docs/architecture/AUTH_AND_PERMISSIONS.md).
- **Unlisted ≠ strongly private.** An unlisted post is reachable by anyone
  who has its URL. It is excluded from Discover, search, and category
  browsing, but the link itself is not cryptographically unguessable beyond
  being a random UUID. This is stated plainly in the UI, not implied to be
  more secure than it is.
- **No recommendation model is trained or run.** Categories, tags, and
  declared interests exist as data, and the default feed lightly favors a
  signed-in user's declared interest categories, but this is a transparent,
  explainable boost — not a learned ranking. See
  [docs/research/RECOMMENDATION_ROADMAP.md](docs/research/RECOMMENDATION_ROADMAP.md).

## Spec and checks

The testable parts of this Definition of Good live in [`spec/`](spec/):
unique-opinion-per-user, server-side authorization boundaries, image
validation, and the realtime propagation requirement are all exercised by
automated tests, not just asserted here. See [`spec/README.md`](spec/README.md)
for what ships from the course template versus what this project added.
