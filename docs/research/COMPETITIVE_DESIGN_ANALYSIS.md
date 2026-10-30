# Competitive design analysis (Buy or Pass v2.0)

This is the v2.0-specific research pass, done in response to the tutor's
feedback that the original concept needed more developed comparison,
context, and discovery mechanics. It is additive to the existing
`docs/research/COMPETITOR_ANALYSIS.md` (product-level competitors), not a
replacement — this document focuses on *specific, verified, reusable
implementation patterns* from real open-source projects and purchase-advice
communities, each checked against its actual current state, license, and
source rather than assumed from reputation. All facts below were verified
live on 2026-10-31 via `gh api`/`gh repo view`/direct page fetches; every
row states its exact source so a claim here can be re-checked.

## GitHub reference repositories

| Repo | State (verified) | License (verified) | Relevant pattern | Adopted / rejected for Buy or Pass |
|---|---|---|---|---|
| [discourse/discourse](https://github.com/discourse/discourse) | Active, last push 2026-10-30 | GPL-2.0 | Core forum engine; as of July 2025 absorbed ~30 previously-standalone plugins directly into core (disabled by default) rather than keeping them as separate installs | **Pattern noted, not code-reused**: voting/accepted-answer behavior is treated as an optional, attachable capability on a generic post model, not a bespoke type. Buy or Pass's own `post_mode` column (ADR 0003) follows the same instinct — one `posts` table, a mode flag, not a parallel schema per mode |
| [discourse/discourse-post-voting](https://github.com/discourse/discourse-post-voting) | **Archived** (`archived: true`); last commit 2025-07-14; README states it was "bundled into Discourse core" | MIT | Per-post (not just per-topic) voting — multiple competing answers within one thread can each accumulate votes | **Rejected for Buy or Pass**: this models "which answer in a thread is best," a different shape from "which of 2-4 concrete products should I buy." Buy or Pass's comparison mode instead attaches options to the *post itself* (`purchase_options`), not to reply-level content |
| [discourse/discourse-solved](https://github.com/discourse/discourse-solved) | **Archived**; last commit 2025-07-22; same core-bundling note | MIT | A "mark as solution" action restricted to the topic's original poster, applied to one reply | **Directly adopted as a design pattern**: Feature E's "Influenced My Decision" marker is the same shape — owner-only, pointing at exactly one existing reply/opinion, never affecting the underlying vote tally (see `docs/adr/0004...`'s discussion and CLAUDE.md rule 27) |
| [discourse/discourse-topic-voting](https://github.com/discourse/discourse-topic-voting) | **Archived**; last commit 2025-07-22; same core-bundling note | GPL-2.0 — notably **different from the other two Discourse plugins' MIT license**, confirming license is a per-repo fact, never assumed from the org | Whole-topic voting (coarser-grained than per-post voting) | **Confirms an existing design choice rather than introducing a new one**: Buy or Pass already keeps "aggregate Buy/Pass tally on the post" and "no voting on individual comments" as separate, deliberately non-conflated concerns — this repo's existence as a *separate* plugin from post-voting validates treating them as genuinely different mechanics |
| [apache/answer](https://github.com/apache/answer) | Active, last push 2026-10-21 | Apache-2.0 | Classic Q&A "accepted answer" model — confirmed at the code level: an `Accepted` field lives directly on the Answer entity (`internal/entity/answer_entity.go`), not a side table | **Partially adopted**: storing a decision/outcome as a plain field directly on the relevant row (rather than a side table) is exactly `post_outcomes`'s own shape — a `status` enum column, not a derived join. Where Buy or Pass differs deliberately: the "outcome" here is the *buyer's own* independent decision, never a crowd-computed "accepted" verdict — Apache Answer's accepted-answer is community-decided, Buy or Pass's outcome is buyer-decided, which is the whole point of "the purchase belongs to the buyer" |
| [LemmyNet/lemmy](https://github.com/LemmyNet/lemmy) | Active, last push 2026-10-30 | AGPL-3.0 | Up/down vote score with a log-dampened, time-decayed "hot rank" formula (`log(greatest(1, score+3)) / power(hours_diff+2, 1.8)`), plus a "scaled" variant dividing by community size to stop large communities always dominating rankings | **Explicitly rejected**: this is exactly the kind of algorithmic ranking Buy or Pass's Definition of Good argues against for opinions ("counts always reflect real votes — never fabricated ones," no collapsed aggregate score implying automated judgment). `src/recommendation/chronological.ts` stays deliberately non-learned (category/interest boost only); Lemmy's hot-rank formula was read and rejected on principle, not adopted |
| [getfider/fider](https://github.com/getfider/fider) | Active, last push 2026-10-28 | AGPL-3.0 | Posts carry one of six explicit statuses (`open`/`started`/`completed`/`declined`/`planned`/`duplicate`) as a small closed enum, kept separate from the continuous crowd-vote count — confirmed by reading the actual enum in `app/models/enum/post_status.go` | **Directly adopted as a design pattern, already present pre-v2.0**: `post_outcomes.status` (`BOUGHT`/`DID_NOT_BUY`/`STILL_DECIDING`) is exactly this shape — a small fixed enum, owner-set, kept structurally separate from the vote tally. v2.0 extends this with `purchased_option_id` (which comparison option was actually bought) without changing the enum itself |
| [yuviguru/product-search-platform](https://github.com/yuviguru/product-search-platform) | Real, small personal/portfolio project; not archived; 0 stars/forks, live demo at a personal domain | **No license** — confirmed no `LICENSE` file exists in the repo (404 on direct lookup) and GitHub's API reports `license: null` | A "compare up to 4 products side-by-side" spec table with best-value highlighting per attribute row, persisted comparison state, URL-shareable filtered views | **Design idea referenced only, no code or content reused** — this repo is unlicensed, so nothing from it was copied; the *idea* of a bounded 2-4-item side-by-side comparison (not an unbounded list) independently matches the brief's own approved scope for Feature B, and is noted here only as prior art that the idea isn't novel, not as a license to reuse anything |

## Purchase-advice community UX

**r/buildapcforme's submission template** — verified via a PCPartPicker forum
post that reproduces the subreddit's own template
([pcpartpicker.com/forums/topic/406681](https://pcpartpicker.com/forums/topic/406681-2000-2500-gaming-pc-first-build-detailed-description-from-the-rbuildapcforme-template);
read via a search-indexed snippet, since a direct fetch returned 403 — cited
here as a secondary source, not a directly verified full-page read). Fields
required: maximum budget, purchase timeline, what's included in the budget,
primary use case, country/region, and existing parts to reuse. This
directly supports Feature A's design: a small set of structured
context fields (current device/equipment, intended use, biggest concern)
converges on the same minimum-viable shape independent communities arrive
at organically.

**r/BuyItForLife** — its actual template or rules page content could **not**
be verified from any accessible source (Reddit blocks automated fetching,
and only generic third-party aggregator summaries were reachable). This gap
is disclosed rather than papered over: no specific claim about
r/BuyItForLife's structure is made in this document beyond its general
existence as a durability-focused purchase community.

**OutdoorGearLab's award methodology** — verified via a live fetch of
[outdoorgearlab.com](https://www.outdoorgearlab.com/) and its category
pages. Three parallel award tiers were confirmed directly on the live site:
**Editors' Choice** (best overall in category), **Best Buy** (best value),
and **Top Pick** (best for one specific use case, e.g. "Top Pick for
cold-weather"). Reviewers buy every tested product at retail (no
manufacturer freebies) and score against category-specific weighted
rubrics, but present *multiple parallel "best for X" awards rather than one
aggregate ranked score*. This is the strongest single piece of external
validation for Buy or Pass's existing no-single-score philosophy: rather
than collapsing opinions into one number, both Buy or Pass and
OutdoorGearLab let different answers coexist for different needs — "best
overall" and "best for cold weather" are different, equally valid answers,
the same way Buy or Pass's comparison mode presents each option's own
counts rather than declaring one a winner.

## What this research changed about the v2.0 design, concretely

1. **Feature A's context prompts** were already planned before this
   research; the r/buildapcforme template confirmed the field set (current
   equipment, use case, budget-adjacent concern) rather than inventing it —
   a convergent, independently-arrived-at pattern is stronger evidence than
   a single source would be.
2. **Feature E's influential-opinion marker** directly borrows
   discourse-solved's permission shape (owner-only, one target, no vote-count
   side effect) — this is the one place in this research where a specific
   archived plugin's exact design decision was adopted deliberately, not
   just referenced.
3. **Feature C's search explicitly stayed non-ranked** specifically because
   reading Lemmy's hot-rank formula clarified what Buy or Pass is
   *choosing not to be*: FTS5 keyword relevance (`bm25()`), not a
   popularity-weighted ranking — the research surfaced a real, well-built
   alternative and the decision to reject it was made with that alternative
   fully understood, not out of unfamiliarity with what a ranked feed looks
   like.
4. **No aggregate score or trending algorithm was added anywhere** —
   OutdoorGearLab's multi-tier-award pattern and the Definition of Good's
   existing "honest results" principle independently point the same
   direction, which is read here as corroboration rather than coincidence.

## Disclosed verification gaps

- r/BuyItForLife's specific template/rules content could not be verified
  and is not cited beyond its general existence.
- The r/buildapcforme template was read via a secondary (search-indexed)
  source after a direct fetch was blocked (403) — treated as weaker
  evidence than a directly-read source.
- OutdoorGearLab has no single canonical "how we test" methodology page;
  the methodology described here was reconstructed from the live homepage
  and multiple category pages, not one document.
- Nothing from `yuviguru/product-search-platform` was reused as code or
  content — it has no license, so only the general idea (bounded
  side-by-side comparison) is referenced, with an explicit note that this
  idea is also independently obvious from the brief's own requirements, not
  solely derived from that repo.
