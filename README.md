# Buy or Pass

**You want it. What does everyone else think?**

A COMP4020/COMP8020 Final Project. This repository carried two earlier
products ([ADR 0002](docs/adr/0002-pivot-bug-relay-to-buy-or-pass.md)); v2.0
answers tutor feedback
([response](docs/product/TUTOR_FEEDBACK_RESPONSE.md)).

## What this is

A good purchasing decision depends not only on the product, but on the
person, their needs, and their circumstances. Buy or Pass is built on that
claim.

A user posts something they're considering buying, with enough context for a
stranger to give relevant advice. Others give 👍 Buy or 👎 Pass, or pick one of
2–4 compared options, with one short comment. The buyer reads the opinions
and decides. There is no aggregate verdict and no judge.

Discover starts from 72 real products with real photos (Amazon Berkeley
Objects, CC BY 4.0; see `/credits`), never with prices, ratings or reviews.
Labelled fictional demos are kept apart, in `/showcase`.

## Definition of good

**Good advice is relevant, honest, and easy to give. The purchase belongs
to the buyer. The opinions belong to the community.**

This sentence has been the definition since the move to Buy or Pass. The six
points below are how I read it now, for the app as it actually exists.

- **Relevant human context.** A post can answer up to three optional
  category prompts plus free text. That is meant to be enough for relevant
  advice without becoming a questionnaire. A skipped prompt never shows as a
  blank card.
- **Low-friction participation.** An opinion is one stance (or one pick)
  and one short comment.
- **Honest information and provenance.** Counts are computed live, not
  stored. Demo content is labelled as AI-generated fiction and kept out of
  every real count. Catalog products carry facts and their sources, never
  prices, ratings or engagement.
- **Buyer agency.** The app never turns votes into a decision. Only the
  buyer records Bought / Didn't buy / Still deciding. They can mark the one
  opinion that influenced them, which never changes a count.
- **Real-time co-presence.** Every shared change appears in other open
  sessions within about a second
  ([ADR 0005](docs/adr/0005-realtime-event-contract.md)).
- **Reliability and accountability.** Each account has one current opinion
  per post, enforced by the database. The server decides who may change
  what, and logs who did what without logging what they wrote.

## What we read

On good at a small scale:

- Parimal Satyal,
  [*Rediscovering the Small Web*](https://neustadt.fr/essays/the-small-web/)
  (2020). He argues against a web built around engagement, tracking and
  algorithmic feeds. That matches what I want here: useful, honest opinions
  rather than a site that looks busy. So there are no fake engagement
  numbers, no invented ratings, and no algorithm telling people what to buy.
- Ben Hoyt,
  [*The small web is beautiful*](https://benhoyt.com/writings/the-small-web-is-beautiful/)
  (2021). He argues for few dependencies, server-rendered pages, and a single
  server with SQLite. That describes this app's stack. I read it as support
  for keeping things simple, not as a reason to skip accounts, persistence
  or reliable real-time updates.

On how purchase advice works:

- **The r/buildapcforme submission template**, read through a PCPartPicker
  reproduction. It asks for use, budget and what you already own. Our
  context prompts were planned before I read it; it confirmed that a few
  practical fields are what communities ask for.
- **OutdoorGearLab's parallel awards.** It gives "best overall" and "best for
  cold weather" as separate answers, not one score. This supports showing
  raw counts instead of a single number.
- **discourse-solved.** Its owner-only, one-reply "solution" mark is the
  shape of our influential-opinion marker.
- **Lemmy's hot-rank formula**, read and rejected. It is the
  popularity-weighted ranking we chose not to be.

Details and verification gaps are in
[`docs/research/COMPETITIVE_DESIGN_ANALYSIS.md`](docs/research/COMPETITIVE_DESIGN_ANALYSIS.md).

## What we chose not to build

- compulsory questionnaires;
- blind-voting phases;
- debate rounds;
- multi-stage review;
- voting deadlines;
- karma or expertise gates;
- star ratings;
- an AI purchase advisor or verdict.

Each would slow advice down or move the decision away from the buyer.

## Enforced and judged

**Enforced** by [`spec/`](spec/) against a running disposable instance, and
by two-browser scripts in `scripts/`:

- one opinion per account per post, including under concurrent submits;
- authors cannot opine on their own posts;
- only the buyer records the outcome, and a majority vote never produces
  one;
- the mode-specific opinion shapes;
- demo and catalog separation;
- unanswered prompts render nothing;
- each shared change emits its live event.

**Judged, not yet assessed with real users:**

- whether the opinions actually help someone decide, with less uncertainty
  and less effort;
- whether context makes advice more relevant;
- whether one sentence is easy enough to give;
- whether old discussions help someone considering a similar product.

A study protocol is prepared but has not been run. See
[`docs/evidence/GOOD_TO_EVIDENCE.md`](docs/evidence/GOOD_TO_EVIDENCE.md).

## Stack

Node.js 24 with `node:sqlite` (FTS5) and type-stripped TypeScript, vanilla
JavaScript, Server-Sent Events, `sharp` and `busboy`. Reasoning:
[PROCESS.md](PROCESS.md), [`docs/adr/`](docs/adr/).
