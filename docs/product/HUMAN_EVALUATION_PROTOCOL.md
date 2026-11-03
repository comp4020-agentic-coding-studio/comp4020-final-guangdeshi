# Human evaluation protocol: baseline vs. refined Buy or Pass

## Status: prepared, not yet conducted

**No study described in this document has been run.** This is a
reproducible protocol for a baseline-vs-v2.0 comparison, written so it can
be executed before the Final submission if time allows, or cited honestly
as "designed but not conducted" if it isn't. No participant data,
transcript, or result anywhere in this repository should be read as
evidence this study happened unless a separate, dated results document
exists alongside it (it does not, as of this writing).

This matters specifically because `spec/`'s automated tests already verify
every *mechanical* claim this document would otherwise need to re-check
(constraint enforcement, authorization, concurrency, backward
compatibility) — what automated tests cannot verify is the actual
judgment call this project's Definition of Good makes: whether the v2.0
features make the advice buyers receive *more relevant, more honest, and
easier to give*, as experienced by a real person, not just mechanically
correct.

## What this study is trying to find out

Three questions, each tied directly to one of the tutor's original
observations and the corresponding v2.0 feature:

1. **Does Adaptive Purchasing Context (Feature A) actually produce more
   relevant opinions**, or does it just add friction to posting without
   changing what reviewers write?
2. **Does Which One? comparison mode (Feature B) produce a clearer outcome
   for the buyer** than reading the same information spread across 2-3
   separate single-product Buy/Pass posts would?
3. **Does the demo content (Feature D) change a new visitor's first
   impression** of whether this is a "live," worth-participating-in
   community, compared to seeing an empty or near-empty real feed?

## Design: within-subject, task-based, baseline vs. v2.0

Each participant uses **both** versions of the app (git history makes a
pre-v2.0 checkout trivial to stand up locally — e.g. the commit immediately
before `feature/buy-or-pass-v2` branched), in a randomized order to control
for learning effects, performing the same two tasks on each:

- **Task 1 (poster)**: "You're considering buying [a real or realistic
  product the participant names or is given]. Create a post asking the
  community whether you should buy it." On the v2.0 version, this
  surfaces the context prompts naturally as part of posting; on baseline,
  there is no context step.
- **Task 2 (reviewer)**: "Here are three posts people are considering.
  Give your honest Buy/Pass opinion (or comparison pick) on each, as if
  you were a real community member." Pre-seeded posts for this task should
  mirror real `demo-scenarios.ts` content so baseline and v2.0 reviewers
  see comparable material, with one of the three being a Which One?
  comparison post only on the v2.0 side (baseline has no equivalent, so
  the reviewer instead does the closest baseline analogue: three separate
  single-product Buy/Pass posts for the same underlying decision).

5-8 participants is a reasonable target for a course-project qualitative
study — enough to see a consistent pattern or a split, not a claim of
statistical significance.

## What to measure

**Observed, not self-reported, wherever possible:**

- Time to complete Task 1 on each version (context prompts add a step —
  worth knowing honestly whether that step feels like meaningful signal or
  like friction).
- Whether the participant fills in any optional context prompt
  unprompted, or skips all of them — a real behavioral signal about
  whether the prompts feel worth answering.
- For Task 2's comparison case: does the participant's final pick and
  comment differ in *specificity* between the three-separate-posts
  baseline version and the single Which One? page (e.g. do they reference
  a side-by-side price/condition comparison that the baseline layout
  didn't surface as directly)?
- Whether the participant, shown the demo feed (`/discover/demo`) vs. a
  near-empty real feed on a fresh baseline install, describes the app
  differently when asked "does this feel like a product people actually
  use?"

**Self-reported, via a short post-task interview (not a Likert survey —
qualitative answers are more useful at this sample size):**

- "Did answering the context questions change what you'd want to say as a
  reviewer, or did it feel like extra steps for the poster?"
- "For the comparison case, which version made it easier to actually decide
  which option to recommend, and why?"
- "Would you trust an opinion more, less, or the same if you knew the
  poster had answered those context questions?"
- "Looking at the demo feed, does this look like a community you'd want to
  post into?"

## Observation template (fill in per participant)

```
Participant: [anonymized id, e.g. P1]
Order: [baseline-first | v2-first]
Date:
Facilitator notes (observed, not inferred):

Task 1 — Poster
  Baseline time to post:        ___s
  v2.0 time to post:            ___s
  Context prompts answered (v2.0, out of up to 3): ___
  Notable verbatim quote:

Task 2 — Reviewer
  Baseline: did the participant treat the 3 separate posts as related? (y/n)
  v2.0: did the comparison layout change their stated reasoning? (y/n + quote)
  Notable verbatim quote:

Demo feed impression
  Verbatim answer to "does this feel like a community you'd want to post into?":

Post-task interview answers (verbatim or close paraphrase):
  Q1 (context friction vs. signal):
  Q2 (comparison mode clarity):
  Q3 (trust in context-backed opinions):
  Q4 (demo feed impression):

Facilitator's own observation (not the participant's words):
  Anything the participant did that contradicts what they said:
```

## What would make this evidence worth acting on, and what would not

- A **consistent pattern across most participants** (e.g. 5 of 6 say the
  comparison layout made their recommendation clearer) is worth citing as
  a real finding, even at this small a sample — not as statistically
  significant, but as a directional signal worth the weight this project
  gives it.
- A **split with no clear majority** should be reported as exactly that —
  an open question, not rounded up to "users liked it" in either direction.
- **This document being filled in with invented participant responses
  would be a worse outcome than not running the study at all**, since it
  would misrepresent an actual design decision as empirically validated
  when it wasn't. If this study is not run before a deadline, the honest
  report is: "prepared, not conducted, see
  `docs/product/HUMAN_EVALUATION_PROTOCOL.md`" — exactly the sentence this
  document's own status line states.

## Relationship to the automated test suite

This protocol deliberately does not re-test anything `spec/` already
covers mechanically (constraint enforcement, authorization boundaries,
concurrency safety, backward compatibility with pre-v2.0 data). Those are
settled by `pnpm check` and don't need a human in the loop. What a human
study adds is specifically the question automated tests structurally
cannot answer: whether the *feature*, correctly implemented, actually
serves the Definition of Good's human-facing claims ("relevant, honest,
easy to give") better than the version it replaced.
