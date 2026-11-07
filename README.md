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
2–4 compared options, with one short comment. The
buyer reads the opinions and decides. There is no aggregate verdict and no
judge.

Discover starts from 72 real products with real photos (Amazon Berkeley
Objects, CC BY 4.0; see `/credits`), never with prices, ratings or reviews.
Labelled fictional demos are kept apart, in `/showcase`.

## Definition of good

**Good advice is relevant, honest, and easy to give. The purchase belongs
to the buyer. The opinions belong to the community.**

- **Human context, bounded.** A post can answer up to three optional
  category prompts plus free text. That is enough for relevant advice, and
  never a questionnaire. A skipped prompt never renders as a blank card.
- **Easy to give.** An opinion is one stance and one sentence. Each account
  holds one current opinion per post, enforced by a database constraint.
- **Honest data.** Counts are computed live. Demo content is bannered as
  AI-generated fiction and kept out of every real count. Catalog products
  carry facts, never prices or engagement.
- **Buyer agency.** No verdict exists anywhere in the schema. The buyer alone
  records Bought / Didn't buy / Still deciding. They may optionally mark the
  one opinion that influenced them, which never changes a count.
- **Transparent history.** Past decisions surface by plain keyword search,
  not a ranking algorithm.
- **Co-presence.** Every shared change appears in other open sessions within
  about a second
  ([ADR 0005](docs/adr/0005-realtime-event-contract.md)).

## What we read

- **The r/buildapcforme submission template,** read via a PCPartPicker
  reproduction. Communities converge on a few context fields: use, budget,
  what you already own. That bounded our prompts to three.
- **OutdoorGearLab's parallel awards.** It gives "best overall" and "best for
  cold weather" as separate answers, not one score. That supports raw counts
  over a single number.
- **discourse-solved.** Its owner-only, one-reply "solution" mark is the
  shape of our influential-opinion marker.
- **Lemmy's hot-rank formula,** read and rejected. It is the
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
- only the buyer records the outcome;
- the mode-specific opinion shapes;
- demo and catalog separation;
- unanswered prompts render nothing;
- each shared change emits its live event.

**Judged, not yet assessed:**

- whether context makes advice more relevant;
- whether one sentence is easy enough to give;
- whether buyers feel the decision stays theirs.

A study protocol is prepared but has not been run. See
[`docs/evidence/GOOD_TO_EVIDENCE.md`](docs/evidence/GOOD_TO_EVIDENCE.md).

## Stack

Node.js 24 with `node:sqlite` (FTS5) and type-stripped TypeScript, vanilla
JavaScript, Server-Sent Events, `sharp` and `busboy`. Reasoning:
[PROCESS.md](PROCESS.md), [`docs/adr/`](docs/adr/).
