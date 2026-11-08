# Buy or Pass

**You want it. What does everyone else think?**

A COMP4020/COMP8020 Final Project. This repository carried two earlier
products before this one ([ADR 0002](docs/adr/0002-pivot-bug-relay-to-buy-or-pass.md)).

## What this is

A good purchasing decision depends not only on the product, but on the
person, their needs and their circumstances. Buy or Pass is for anyone
weighing a purchase who wants advice about their own situation, not a
generic star rating.

A buyer posts what they're considering, with some context. Others give 👍 Buy
or 👎 Pass, or pick one of 2–4 options, with one short comment. The buyer
decides. Discover starts from 72 real catalog products.

## Definition of good

**Good advice is relevant, honest, and easy to give. The purchase belongs
to the buyer. The opinions belong to the community.**

The six points below are how I now read that sentence for the app as built:

- **Relevant human context.** Up to three optional category prompts plus free
  text: enough for relevant advice, never a questionnaire.
- **Low-friction participation.** An opinion is one stance (or one pick) and
  one short comment.
- **Honest information and provenance.** Counts are computed live. Demo
  content is labelled as AI-generated and kept out of every real count.
  Catalog products carry facts and sources, never prices or engagement.
- **Buyer agency.** Votes never become a decision. Only the buyer records
  Bought / Didn't buy / Still deciding.
- **Real-time co-presence.** Every shared change reaches other open sessions
  within about a second.
- **Reliability and accountability.** One current opinion per account per
  post; the server checks who may change what and logs who did what.

## What we read

- Parimal Satyal,
  [*Rediscovering the Small Web*](https://neustadt.fr/essays/the-small-web/)
  (2020), argues against a web built around engagement and algorithmic
  feeds. I agree a site can do one useful thing well without trying to look
  busy, so there are no fake engagement numbers, invented ratings or
  algorithm telling people what to buy.
- Ben Hoyt,
  [*The small web is beautiful*](https://benhoyt.com/writings/the-small-web-is-beautiful/)
  (2021), argues for few dependencies and a single server with SQLite, which
  matches this app's stack. But small or simple doesn't automatically mean
  good: a site strangers use still needs proper accounts, persistence and
  reliable real-time updates.
- Purchase-advice communities: the r/buildapcforme template confirmed the
  context prompts we had already planned; OutdoorGearLab's separate
  "best for X" awards support raw counts over one score; Lemmy's hot rank
  is the popularity ranking we rejected. Details:
  [`docs/research/COMPETITIVE_DESIGN_ANALYSIS.md`](docs/research/COMPETITIVE_DESIGN_ANALYSIS.md).

## What we chose not to build

Compulsory questionnaires, blind voting, debate rounds, multi-stage review,
voting deadlines, karma or expertise gates, star ratings, and an AI advisor
or verdict. Each would slow advice down or take the decision from the buyer.
The trade-off: the buyer has to weigh the opinions themselves.

## Enforced and judged

**Enforced** by [`spec/`](spec/) against a running disposable instance, and
by two-browser scripts in `scripts/`:

- one opinion per account per post, even under concurrent submits;
- authors can't opine on their own posts;
- only the buyer records the outcome; a majority never produces one;
- demo content stays out of real counts;
- each shared change is pushed live.

**Judged, and not yet assessed with real users:**

- whether the opinions actually help someone decide;
- whether context makes advice more relevant;
- whether one sentence is easy enough to give;
- whether old discussions help someone looking at a similar product.

A study protocol is prepared but not run. Full mapping:
[`docs/evidence/GOOD_TO_EVIDENCE.md`](docs/evidence/GOOD_TO_EVIDENCE.md).

## Stack

Node.js 24 with `node:sqlite`, type-stripped TypeScript, vanilla JavaScript
and Server-Sent Events. Reasoning: [PROCESS.md](PROCESS.md).
