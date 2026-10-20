# Recommendation roadmap

**This phase ships no recommendation model.** `src/recommendation/types.ts`
defines a `RecommendationService` interface; `src/recommendation/
chronological.ts` is the only implementation, and it is explicitly
transparent: category/interest boosting with no learned ranking, no
embeddings, no training, and no external model calls. This document
evaluates what a *future* iteration could do, and the constraints any such
iteration must respect.

## The motivating problem

A purchasing question about a specialist Mac mini workstation should
preferentially reach people interested in computing, local AI, or developer
hardware, rather than only random visitors browsing the default feed. The
current `ChronologicalRecommendationService.getFeedForUser` partially
addresses this today: if a signed-in viewer has declared interest in the
`computing` category, their first feed page leads with recent posts in
that category before falling back to the plain chronological feed. This is
deliberately simple and fully explainable — not a scored ranking.

## Evaluation of future approaches

### 1. Content-based matching

Match a post's `category`/`tags`/intended-use text against a user's declared
interests (already partially implemented) or, more richly, embed post text
and compute similarity to a user's historical engagement topics.
**Strength**: no cold-start problem for new posts (works immediately based
on the post's own content). **Weakness**: a user's own declared interests
may be stale or incomplete; purely content-based matching can't discover an
interest the user hasn't told the platform about yet.

### 2. Collaborative filtering

Recommend a post to a user because "users similar to you engaged with
similar posts." **Strength**: can surface posts a user wouldn't have
searched for via their stated interests. **Weakness, and the central risk
flagged by the brief**: collaborative filtering conventionally treats
*any* engagement signal as positive affinity — and this product's two
engagement signals (giving an opinion, and which stance you gave) are **not**
safe to use this way. See "The critical constraint" below.

### 3. Hybrid content/collaborative

Blend (1) and (2) — e.g. use content similarity to find candidate posts,
then collaborative signals to rank among them. Standard mitigation for pure
collaborative filtering's cold-start weakness. Still inherits the same risk
around what counts as a valid "engagement" signal — the hybrid doesn't fix
the stance-interpretation problem, it just blends a tainted signal with a
cleaner one.

### 4. Cold-start behavior

For a brand-new user with no declared interests and no history (today:
served the plain chronological feed, which is itself a legitimate,
honest cold-start default — not a placeholder to be embarrassed about), and
for a brand-new post with no opinions yet (today: `getRelatedPosts` falls
back to same-category recency, so a new post with zero engagement is still
discoverable via category). Any future ranking model needs an equally
well-defined fallback, not an assumption that enough data always exists.

### 5. Expertise/relevance without vote weighting

The brief explicitly warns against building "an expertise badge" gate on who
may opine (see `README.md` point H and `CLAUDE.md` rule 9) — but a
*feed-ranking* model raises a related, narrower question: could a user's
history of *giving* opinions on computing posts be used as a positive
"interested in computing" signal for feed ranking (as opposed to a
gatekeeping signal for who may opine)? This is more defensible than vote-
weighting (see below) because it's about surfacing posts to read, not
restricting who may respond — but even this should be an explicit, opt-out-
able signal, not an opaque score, to preserve the "no opaque match score"
value already established for the sibling SkillLoop prototype's matching
design and consistent with this product's own "honest results" principle.

### 6. Privacy and popularity bias

A ranking model trained on engagement risks two distortions: (a) privacy —
inferring a user's interests from their activity more precisely than they
chose to disclose via `user_interests`, and (b) popularity bias — a model
that amplifies already-popular posts/categories further, drowning out a
genuinely relevant but low-traffic post (directly undermining "relevance
without gatekeeping"). Any future model should be evaluated against both
before shipping, not just by engagement-metric lift.

## The critical constraint (non-negotiable)

**A user's BUY/PASS stance on a post is not a reliable indicator of the
voter's own interest in that category, and must never be used as one.**
Voting PASS on a specific laptop is an opinion about whether someone *else*
should buy *that specific item for their stated use* — it is not evidence
the voter dislikes laptops, computing, or that category in general. A model
that folded PASS into a negative-affinity signal would, for example, learn
to stop showing computing posts to a knowledgeable computing enthusiast who
gives thoughtful PASS opinions specifically *because* they know the space
well enough to say "don't buy that one." `CLAUDE.md` rule 8 states this as a
standing rule for any future implementation of `RecommendationService`.

## What the current interface already protects

`getMatchingSignals(userId, postId)` in `src/recommendation/types.ts` only
ever returns signals that are true by construction from `user_interests`
(e.g. "you follow this category") — never a learned or inferred score, and
never derived from the user's own opinion history. Any future model must
implement the same `RecommendationService` interface
(`getFeedForUser`/`getRelatedPosts`/`getMatchingSignals`) so it's a drop-in
replacement behind `src/server.ts`'s existing call sites, not a rewrite of
the feed/post-detail routes.

## No model is trained or called in this phase

No machine-learning library, embedding API, or external recommendation
service is used anywhere in this codebase. `recommendationService` in
`src/recommendation/chronological.ts` is pure SQL queries over
`categories`/`user_interests`/`posts` — fully inspectable and explainable,
consistent with the brief's explicit instruction to defer DIN, MIND,
OneRec, HSTU, semantic embeddings, rerankers, or any other advanced
recommendation algorithm to a future workstream.
