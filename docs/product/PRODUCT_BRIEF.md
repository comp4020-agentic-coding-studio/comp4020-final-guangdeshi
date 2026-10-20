# Product brief: Buy or Pass

## One-line pitch

"You want it. What does everyone else think?" — post a purchase you're
considering, get fast 👍 Buy / 👎 Pass opinions from real people, decide for
yourself.

## Problem

Before a non-trivial purchase, people often want a second opinion but the
available channels are mismatched to the need: a group chat is slow and
buries the question; a forum post invites a debate thread, not a quick
signal; a review site is about products in general, not "should *I*, given
*my* specific use case, buy *this*." What's missing is a fast, low-friction
way to post the actual decision ("I'm considering X, for Y reason") and get
back a small number of clear, explicit reactions.

## Target users

Anyone weighing a purchase big enough to want outside input but not so
formal that they'd commission a full review — a student balancing a
want against a budget, a hobbyist choosing between two similar products, a
professional deciding on a tool purchase. No specialist audience is
required; the "post a purchase, get opinions" loop works whether the author
has three followers or three hundred.

## Non-goals (explicitly out of scope)

Per the course brief, this is **not** a shopping court. The following are
deliberately not built, because they would turn a fast opinion loop into a
slow formal process:

- Compulsory questionnaires before a user can view or opine.
- A blind-voting phase (opinions are visible as they arrive — see
  [docs/design/DESIGN_SYSTEM.md](../design/DESIGN_SYSTEM.md) for why open
  visibility was chosen over blind voting).
- Formal debate or challenge rounds between opinion-givers.
- Multiple sequential review stages before a post counts as "resolved."
- An automatic AI purchase verdict or aggregate recommendation score beyond
  the raw Buy/Pass counts.
- Mandatory voting deadlines.
- A complex AI purchase advisor — no model is trained or called to tell the
  author what to do.

## Success looks like

- A visitor understands, within seconds of landing on the homepage, what to
  do (post a purchase, or give an opinion on someone else's).
- Giving an opinion takes one stance selection, one short comment, one
  submit — no multi-step wizard.
- An author who returns to a post they made sees real opinions from real
  accounts, with live-updating counts, and is never told what to do by the
  platform itself.
- The purchase-outcome follow-up (Bought / Didn't Buy / Still Deciding) is
  genuinely optional and lightweight — a single choice plus an optional short
  reflection, not a satisfaction survey.

## Core loop (see also README.md "Core user journey")

Post → opinions arrive live → author decides independently → optional
follow-up. Every piece of this repository — schema, API shape, UI copy, and
the Definition of Good in
[docs/product/GOOD_AND_EVALUATION.md](GOOD_AND_EVALUATION.md) — exists to
keep that loop fast and honest.
