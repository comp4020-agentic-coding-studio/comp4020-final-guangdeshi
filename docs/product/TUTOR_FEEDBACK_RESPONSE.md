# Tutor feedback response (Buy or Pass v2.0)

## The feedback, verbatim

> "I think it is a good idea for the final assignment that meets all the
> criteria."

The tutor accepted Buy or Pass's core concept but found its response to the
brief insufficiently developed, raising twelve specific observations. This
document addresses each one directly: what was raised, how v2.0 responds,
which implementation file carries that response, and which test verifies
it.

## 1. "Can an LLM populate the site with generated data?"

**Response:** Yes — Feature D. 18 fictional purchasing scenarios were
authored by Claude (this development session) as part of the development
workflow, not via a runtime external LLM API call, per the brief's explicit
instruction.

**Implementation:** `src/demo-scenarios.ts` (the scenario content),
`scripts/seed-demo-content.ts` (idempotent seeding, reusing the real
`createPost`/`upsertOpinion` code paths with `isDemo: true`),
`src/migrations.ts`'s `demo_metadata` table (records generation method,
model identity, seed version, validation method per post — never
fabricated provenance).

**Test:** `spec/demo.test.ts` (auth gating on the seed route, real/demo
separation in feeds and banners); the seeding script's own correctness
(idempotent re-run, 18 posts, 48 opinions, images actually processed) was
verified directly against a throwaway database during development, recorded
in this session's commit history rather than re-asserted as an HTTP test.

## 2. "The existing README correctly identifies Human Context as important."

**Response:** Acknowledged as a starting point the tutor confirmed was
already right in principle — v2.0's job was to make Human Context concrete
and structured rather than just named. See observations 3-5 below for the
actual mechanism.

## 3. "Voters need more context than the current application gives them."

**Response:** Feature A. Every post can optionally answer up to 3
category-specific prompts plus one free-text field, rendered as a compact
"About this decision" section above the opinion form — visible to a
reviewer before they vote, not buried after.

**Implementation:** `src/context-prompts.ts` (the prompt definitions),
`post_context` table (`src/migrations.ts`), `contextCard()` in
`src/render.ts`.

**Test:** `spec/context.test.ts`.

## 4. "The amount of context must be appropriate. Users should not need to read someone's life story to give a Buy or Pass opinion."

**Response:** Capped at 3 prompts plus one free-text field, enforced at the
single source of truth (`getContextPrompts()` always returns `.slice(0,
3)`, regardless of how many a category's config lists) — never an
exhaustive questionnaire. No prompt is required; a post with zero answers
renders with no context section at all, never a blank or placeholder card.

**Implementation:** `src/context-prompts.ts`'s `getContextPrompts()`;
`contextCard()` in `src/render.ts` filters to only answered prompts.

**Test:** `spec/context.test.ts`'s "renders only the prompts the buyer
actually answered, never a blank card" and "renders no context section at
all when nothing was answered."

## 5. "Context varies by purchasing decision" (the sleeping-bag example)

**Response:** Category-specific prompt sets, with an optional subtype
override within a category — directly implementing the tutor's own worked
example (current equipment, frequency of use, expected temperatures for a
sleeping bag specifically, distinct from the parent "outdoors-fitness"
category's more general prompts).

**Implementation:** `src/context-prompts.ts`'s `CATEGORY_PROMPTS` entry for
`outdoors-fitness`, including a `sleeping-bag` subtype whose three prompts
are worded exactly to the tutor's example (current sleeping bag and pad,
hiking frequency, expected overnight temperatures).

**Test:** `spec/context.test.ts`'s outdoors-fitness context test;
`getContextPrompts("outdoors-fitness", "sleeping-bag")`'s subtype-lookup
logic is exercised directly.

## 6. "Could voters choose between multiple product options?" (the NZ hike / three sleeping bags example)

**Response:** Feature B, Which One? mode — directly implementing the
tutor's own example: a post can compare 2-4 concrete candidate products
(name, image, expected price, optional original price for a discount
comparison, condition, source link, sale note, specifications), and a
reviewer picks exactly one or "None of these" plus a comment.

**Implementation:** `posts.post_mode`, `purchase_options` table
(`src/migrations.ts`), the three-way discriminated `opinions` shape
(`stance` XOR `selectedOptionId` XOR `selectedNone`), `handleSubmitComparisonOpinion`
in `src/server.ts`. Full design rationale in
`docs/adr/0003-post-modes-and-comparison-voting.md`.

**Test:** `spec/comparison.test.ts` (16 tests covering option-count bounds,
selection rules, cross-post option-id rejection, concurrent-submission
safety, and that a comparison selection never inflates a Buy/Pass count).

## 7. "The actual expected purchase price matters, especially when products are discounted."

**Response:** Each comparison option carries both an `expectedPriceCents`
(what the buyer expects to pay — always shown) and an optional
`originalPriceCents` (a claimed list price, shown struck through only if
supplied) plus a free-text `saleNote` — never a computed "% off" figure
that would imply a bigger discount is automatically the better decision
(the Definition of Good's "comparable choices... without inventing
universal scores").

**Implementation:** `purchase_options.original_price_cents`/`sale_note`
columns; `purchaseOptionCard()` in `src/render.ts` renders the struck-through
original price and sale note as plain text, never a derived percentage.

**Test:** `spec/comparison.test.ts`'s option-creation tests include a sale
scenario; `src/demo-scenarios.ts`'s sleeping-bag comparison scenario
exercises a real sale-note example (`"End-of-season sale, $100 off"`) end
to end through the seeding script.

## 8. "Historical purchasing discussions could help future users understand the circumstances under which buying a particular product was sensible."

**Response:** Feature C, Similar Historical Decisions — a lightweight,
transparent SQLite FTS5 full-text search over a post's title, description,
and context answers, surfacing related past posts (with their own recorded
outcomes and context) on a post's detail page. Deliberately not a
recommendation model or a ranked/scored algorithm (see
`docs/research/COMPETITIVE_DESIGN_ANALYSIS.md`'s discussion of why Lemmy's
hot-rank formula was read and rejected) — `bm25()` keyword relevance only,
consistent with `RecommendationService`'s existing "no hidden ranking"
contract.

**Implementation:** `posts_search` FTS5 virtual table
(`src/migrations.ts`), `searchPosts()`/`indexPostForSearch()` in
`src/db.ts`, `getRelatedPosts()` in
`src/recommendation/chronological.ts`.

**Test:** `spec/history-search.test.ts` (related-decisions surfacing,
keyword search, unlisted-visibility respected in both surfaces,
soft-deleted posts excluded).

## 9. "Why would people use Buy or Pass instead of Reddit or OutdoorGearLab?"

**Response:** Answered directly in `docs/research/COMPETITIVE_DESIGN_ANALYSIS.md`,
built from verified research rather than assertion: Reddit's purchase-advice
communities (e.g. the r/buildapcforme submission template) converge on
structured context fields but have no comparable-options mode and no
closed-loop outcome tracking; OutdoorGearLab's reviews are pre-purchase
editorial judgments by staff, not community opinions tied to *this specific
buyer's* stated circumstances, and carry no participatory
Buy/Pass-style mechanism at all. Buy or Pass's distinguishing claim is the
combination the tutor's own feedback asked for: structured per-decision
context (observation 3-5), a concrete comparison mode (observation 6), and
a closed-loop outcome record (pre-existing Bought/Didn't Buy/Still
Deciding, now extended with Feature E) — none of which exist together in
either compared product.

**Implementation:** N/A (research/positioning document, not code).

## 10. "Why would they use it while the community is still small?"

**Response:** Feature D, demo content — directly addresses the
cold-start problem the tutor's question identifies. A new or
not-yet-logged-in visitor can see `/discover/demo`'s 18 scenarios
(clearly labelled as fictional) to understand what an active Buy or Pass
community looks like and how the product actually works, without the real
feed needing to already be populated by genuine traffic to make that case.

**Implementation:** `getDemoFeed()` in `src/db.ts`, `demoFeedPage()` in
`src/pages.ts`, the persistent demo banner (`demoLabel()`/`.demo-banner` in
`src/render.ts`).

**Test:** `spec/demo.test.ts`'s "is reachable without logging in" and the
real/demo separation tests.

## 11. "The 'Who is it for?' section needs a stronger explanation of user motivation and product value."

**Response:** README.md was rewritten (see the rewritten version committed
alongside this document) to lead with the refined Definition of Good's
primary position — "a good purchasing decision depends not only on the
product, but on the person, their needs, and their circumstances" — and to
connect that argument explicitly to Features A and B as the concrete
mechanisms that deliver it, rather than restating the original pitch
unchanged.

**Implementation:** `README.md`.

## 12. "The product might help people avoid wasting money on equipment that is unnecessarily expensive or overspecified for their actual needs."

**Response:** This framing directly shaped which demo scenarios were
written — several of `src/demo-scenarios.ts`'s 18 scenarios are explicitly
overspecification cases (e.g. the hiking-backpack scenario where community
advice steers the buyer from an oversized 50L pack to a 32L one matching
their actual trip pattern; the air-fryer and standing-desk scenarios
likewise center on right-sizing a purchase to actual stated use, not
defaulting to "buy the premium option"). This is a demonstration of the
product's value proposition through its own seeded content, not a new
feature — the underlying mechanism (honest community opinions tied to the
buyer's stated context) was already the existing Buy/Pass core; v2.0 just
makes that context visible enough for an overspecification concern to be
raised at all (tied directly to Feature A).

**Implementation:** `src/demo-scenarios.ts` (scenario content design),
pre-existing core BUY_PASS stance/comment mechanism.

## What was deliberately NOT built in response to this feedback

Per CLAUDE.md's standing "don't turn every suggestion into a large feature
or a compulsory form" discipline (quoting the brief's own instruction back):

- **No mandatory context questionnaire.** All context prompts remain
  optional; a post can be created with zero answered (observation 4's own
  explicit warning against this).
- **No algorithmic ranking or recommendation model** for historical
  decisions (observation 8) — a transparent keyword search was chosen
  specifically to avoid the "automated verdict" failure mode the Definition
  of Good already rejects for opinions.
- **No numeric aggregate "value score"** for comparison options
  (observation 7) — expected price, original price, and a sale note are
  shown as plain facts, never combined into a computed ranking.
