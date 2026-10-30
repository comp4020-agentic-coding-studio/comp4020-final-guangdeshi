# ADR 0004: Context prompts as data, and demo content as flagged real rows

## Status

Accepted — v2.0 response to tutor feedback.

## Context

Two of the tutor's observations share a root cause: the app asked for too
little context to give good advice (Feature A), and there wasn't enough
real community activity to demonstrate what a *working* Buy or Pass looks
like (Feature D). Both needed a design decision about where the relevant
data lives and how aggressively to build infrastructure around it, given
CLAUDE.md's standing instruction to default to the smallest reasonable
design and name the call rather than silently over-build.

## Decision part 1: context prompts are a versioned code config, not a database table

**`src/context-prompts.ts` is a plain exported object** mapping a category
id (and optionally a subtype within it, e.g. `sleeping-bag` within
`outdoors-fitness`) to up to 3 `{key, label, placeholder}` prompts, plus one
`GENERAL_PROMPTS` fallback for categories with no specific set. A post's
*answers* to those prompts live in a real database table (`post_context`:
`post_id`, `schema_version`, `category_key`, `answers` JSON, `free_text`),
but the *prompt definitions themselves* — what questions exist, their
wording, their category mapping — are code, reviewed and shipped the same
way a new migration is.

`CONTEXT_SCHEMA_VERSION` is stored alongside each post's answers specifically
so a future redesign of the prompt set (changing what a key *means*, not
just its wording) can tell old answers apart from new ones without guessing
from content — e.g. if `biggest_concern` ever needed to split into two
separate questions, existing `schema_version: 1` answers would stay
interpretable as what they actually were asked.

A post with zero answered prompts gets **no row at all** in `post_context`
— `setPostContext` is only called when at least one answer or the free-text
field is non-empty. This is what makes "never render a blank card for an
unanswered prompt" (the brief's explicit requirement) true by construction
at the data layer: `contextCard()` in `src/render.ts` filters to only
prompts with a non-empty answer, but even before that filter runs, a post
with nothing answered has nothing to filter.

### Alternatives considered

**A `context_prompts` database table**, admin-editable, versioned per row.

Rejected: the actual prompt set (computing, outdoor gear with a sleeping-bag
subtype, photography, fashion, audio) is a small, fixed, author-curated set
that changes at the pace of a code review, not something any user — or even
an admin — needs to edit at runtime. A database table would need its own
admin UI, its own validation, and its own migration story for schema
changes to the prompt shape itself, none of which this project's actual
requirements call for. Code-as-config is also directly unit-testable
(`getContextPrompts("outdoors-fitness", "sleeping-bag")` returns exactly
what's expected) without spinning up a database fixture.

**No subtype mechanism — one fixed prompt set per category.**

Rejected because the tutor's own example (a sleeping bag specifically, not
"outdoor gear" generically) implied that for at least some categories, the
*specific kind* of thing matters for which questions are relevant ("what
temperature rating do you need" is a sleeping-bag-specific question that
doesn't generalize to, say, a tent). The subtype override is a plain
optional field in the same config object — a category with no subtypes
defined simply never has the override triggered, so this added no cost to
every other category.

## Decision part 2: demo content is real rows with an `is_demo` flag, not a separate system

**`posts.is_demo` and `users.is_demo` are boolean columns on the existing
tables**, not a parallel `demo_posts`/`demo_users` schema. A demo post is
created through the exact same `createPost` function a real post uses (with
`isDemo: true` passed through), gets real opinions through the exact same
`upsertOpinion`/`upsertComparisonOpinion` functions, and is rendered through
the exact same `postDetailPage`. A separate `demo_metadata` table (one row
per demo post: `generation_method`, `model_identity`, `generated_at`,
`seed_version`, `validation_method`) records the provenance the brief
requires without polluting the `posts` table itself with fields no real
post needs.

Every query that computes "real" aggregates or feeds was given an explicit
`is_demo = 0` (or `= 1`, for the dedicated demo feed) guard at the point the
query already existed: `listFeed`, `listMostDiscussed`,
`src/recommendation/chronological.ts`'s related-posts search. The dedicated
`/discover/demo` route (`getDemoFeed`) is the only place `is_demo = 1`
content is ever shown mixed together, and every post there renders a
persistent `demo-banner` (not a dismissible tag) reading "Demo scenario —
AI-generated fictional content," per the brief's exact required wording.

Seeding itself (`scripts/seed-demo-content.ts`) is idempotent by checking
`demo_metadata` for the current `DEMO_SEED_VERSION` before inserting
anything — re-running it is a documented no-op, not a duplicate-content bug
or an error. It is callable both as a standalone script and in-process via
`POST /admin/demo/seed` (admin-only), which runs the identical function
rather than maintaining two seeding code paths.

### Alternatives considered

**A separate `demo_posts`/`demo_opinions` schema, entirely disjoint from the
real tables.**

Rejected: it would mean every display path (post card, post detail,
opinion list, search index) needs its own demo-aware branch, doubling the
surface area that has to stay in sync, and risking exactly the failure mode
the brief warns against — a demo scenario accidentally rendering
differently from a real one, or a bug in the demo path going unnoticed
because it's not exercised by the same code real content exercises. Reusing
the real tables with a flag means a demo post is *guaranteed* to look and
behave like a real one (same validation, same rendering, same FTS5
indexing), because it *is* one, structurally — the flag only changes which
feeds and stat counts it is eligible for.

**Treating demo content as fully synthetic/fake without real database rows
(e.g. hardcoded HTML for a "preview" page).**

Rejected: it would prevent exercising the real create/vote/outcome/search
code paths against demo content at all, meaning the demo feed would prove
nothing about whether those paths actually work — explicitly the thing the
tutor's "not enough community activity to demonstrate the product" feedback
asked to see fixed.

## Image provenance for demo content (ties to Feature D)

Per the explicit hybrid-image-strategy decision: where a real,
reusable-licensed photograph could be found and verified (checked against
the actual Wikimedia Commons license template, not a search-result
snippet), it was downloaded and recorded in
`docs/research/IMAGE_PROVENANCE.md` with its source, author, exact license,
and (for the one CC BY image) the attribution text rendered in-app.
Categories with no suitable licensed photo use an original, locally
generated SVG/sharp illustration — never a paid generation API, never an
unlicensed image, and never left blocked waiting for a photo that might not
exist. Both paths go through the same `processAndStoreImage`-equivalent
re-encoding a real upload goes through, so the files actually served are
re-encoded, metadata-stripped copies — the original source files under
`docs/assets/demo-source-images/` are kept only as the source-of-truth
record, not served directly.

## Consequences / drawbacks

- Every future query that aggregates across all posts or all users needs to
  remember the `is_demo` guard — there is no database-level enforcement
  (e.g. a view) that makes forgetting it impossible, only convention and
  the existing guarded call sites as examples to follow.
- The context-prompts-as-code design means adding a genuinely new category's
  prompt set requires a code change and redeploy, not a runtime admin
  action — acceptable given how rarely this actually needs to change, but a
  real constraint if category/prompt curation ever needed to happen faster
  than a deploy cycle.
- `demo_metadata`'s `seed_version` versioning assumes seed content changes
  are "all or nothing" per version — there's no per-scenario versioning, so
  a future content revision that only changes 2 of 18 scenarios would still
  need a full seed-version bump to be detected as "needs re-seeding,"
  though the actual insert logic as written only ever adds new demo posts
  and never touches or removes already-seeded ones from an older version.

## When to revisit

- If category/prompt curation needs to happen without a code deploy (e.g.
  non-engineering course staff adding categories), the context-prompts
  config would need to move to a real database table with its own minimal
  admin UI.
- If demo content needs partial, scenario-level versioning (update just one
  scenario without bumping the whole set), `demo_metadata`'s per-post
  `seed_version` already supports this at the data level — the seeding
  script's own "check the whole count" idempotency gate would need to
  become per-scenario instead.
