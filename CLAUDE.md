# Your harness

This is the project harness for the **COMP4020/COMP8020 Final Project**
("Buy or Pass"): one repository, built across crits 8, 9, 10 and the final
submission. What the product is and what "good" means for it belongs in
`README.md`; this file holds the process rules the agent is held to while
building it.

This harness is a **deliberate merge-forward**, not a copy, from the Crit 7
harness (`comp4020-crit7-GuangdeShi`), which was itself merged forward from
Assignment 2. Sections 1–12 below are workflow/process rules that have now
survived two product pivots (Pick-Up Sticks → Bug Relay → Buy or Pass)
because none of them depend on any one product.

**Crit 8 → 9 pivot:** this repo's Crit 8 submission was "Pick-Up Sticks."
For Crit 9 the product changed to Bug Relay — see `PROCESS.md` for that
reasoning.

**Crit 9 → Final pivot:** for the Final Project the product changed again,
to Buy or Pass — a social shopping-opinion platform. See
`docs/adr/0002-pivot-bug-relay-to-buy-or-pass.md` and `PROCESS.md` for the
full reasoning, what migrated from the isolated Buy or Pass prototype, and
what was preserved from Bug Relay's own history. The process rules below
(sections 1–12) are unaffected by this pivot either, since none of them
depended on Bug Relay's specific product. Sections 13+ are Buy or Pass's own
product-specific rules, carried in from the prototype's harness.

## 1. Audit before acting

Before starting a new stage of work, check the repo's actual current state —
`git status`/`git log`, and the live spec on the course website — rather than
assuming it from memory or from this file. This file goes stale as the
project grows across ten weeks; what's true now is whatever a quick check
confirms.

## 2. Decision boundary

The agent may research, propose alternatives, implement an approved
direction, and verify it. When a genuinely ambiguous product or design
decision comes up — what "good" means for this app, what counts as a
"person," what persists versus expires, a stack choice — don't silently pick
one and move on. Name the decision, give the options considered, and either
wait for a call or take the smallest reasonable default that keeps things
moving, recording *which* default and *why* (a short decision record, e.g. in
`PROCESS.md`) so it can be revisited.

## 3. Stack is a real decision, not boilerplate

The final project brief deliberately ships no starter framework. Whatever
stack gets chosen is a real architectural decision and gets a short rationale
in `PROCESS.md` — not because the course asks for ceremony, but because the
project outgrowing a first choice (e.g. adding real-time in week 10) is
expected, and the record of *why* the first choice was made is what makes a
later switch legible rather than arbitrary.

## 4. Spec / backpressure philosophy

`spec/` protects the promises that can be checked mechanically — a route
responds, the core flow survives a reload, a shipped invariant holds. It is
backpressure, not a substitute for judgement: whether the app is actually
*good* — satisfying, legible, worth the visit — is a human call (the crit,
the tutor), not something a passing test proves. Say those open, judged
items out loud rather than quietly deciding no test is needed.

## 5. Verification before acceptance

Don't report a feature as working because the agent says so, because
`pnpm typecheck`/`pnpm test` is green, or because the code looks plausible.
For a UI change, that means actually exercising it — the golden path and at
least one edge case (a reload, a duplicate action, a restart) — before
calling it done.

If no real graphical browser or browser-automation tool is available in the
current environment, say so explicitly rather than reporting that browser
verification occurred. A built server driven over HTTP, or an automated test
suite, is real evidence, but it is not the same claim as "verified in a
browser," and shouldn't be presented as one.

## 6. Accessibility / invariant checks

`spec/invariants.test.ts` ships with the starter and stays green always — a
real title, a nav/landmark structure sane enough for a one-page app, alt text
where images exist, a mobile viewport meta tag. It's not this week's
contract, but it's still true of any page this app serves.

## 7. Git / commit discipline

Commit at meaningful stage boundaries — not one giant commit at the end, not
one per file save. Before staging: run `git status`/diff and actually look at
what's included; never stage blindly (`git add -A`/`git add .` without
review). Commit messages name the decision or capability that landed, not
"update files" or "progress." History isn't rewritten or squashed casually —
`PROCESS.md` and each week's reflection cite real commit hashes, so the log
has to stay an honest record of how the work actually went. Never force-push.

## 8. Secret handling

Never commit `mise.local.toml`, `.env` files, the Fly API token, or any other
credential. The repo's own `.githooks/pre-commit` secret scan and the CI
trufflehog scan are the backstop; don't bypass or disable them to get a
commit through.

## 9. Process evidence

`PROCESS.md` and `reflections/crit-N.md` cite real commit hashes or compare
ranges, not paraphrase what happened. Don't overwrite or destroy earlier
process/reflection material from a prior crit; extend it. `pnpm check:evidence`
enforces the mechanical parts of this (the files exist, cited commits exist).

## 10. Step-by-step execution and reporting

For any non-trivial stage of work: break it into a small number of concrete
steps, show the step list, execute one step at a time, and report back —
files touched, what was verified, what's next — before continuing. Where the
student has explicitly asked for a specific crit to be built efficiently and
end-to-end without stopping for minor decisions, that instruction governs for
that crit; this section is the default, not an override of an explicit
one-off request.

## 11. Scope control

Keep each crit to what that week's spec actually asks for. Don't add a
feature the brief doesn't ask for yet, however natural it seems to reach for
— real-time/multiplayer, accounts, AI features, and polish beyond the current
week's bar are all examples of scope that stays deferred until the week that
actually calls for it. When it's unclear whether something is in scope,
default to leaving it out and name the call (see section 2).

## 12. Communication language

Where the student has set a language preference for how the agent talks to
them, that preference governs the agent's own reports, explanations,
warnings, decisions, and questions — nothing else. Everything that ships in
or with the repo (code, code comments, commit messages, README, PROCESS.md,
reflections, and any other submission-facing content) stays in English
regardless of that preference.

## 13. The Definition of Good governs every decision

Buy or Pass's product argument is: *good advice is relevant, honest, and
easy to give. The purchase belongs to the buyer. The opinions belong to the
community.* Every architecture choice, UI copy decision, and test in this
repo should trace back to that, not to generic CRUD-app best practice. When a
feature request would compromise it (e.g. "just show an aggregate
recommendation so the author doesn't have to read all the opinions"), name
the conflict and don't silently take the easy path.

## 14. Authentication says who; authorization says what — and authorization is server-side, always

Every mutating route re-derives "who is calling" from the session cookie
(`resolveSession` in `src/auth.ts`), never from a client-supplied user ID.
Every route that changes or reveals user-scoped data checks ownership
explicitly, in the handler, next to the action it guards. The concrete
rules, enforced in `src/server.ts`:

- A user may edit or delete only their **own** posts and opinions.
- Only a post's **author** may record that post's purchase outcome.
- A post's **author never submits an opinion on their own post** — by
  design (see README "Buyer agency"), not an oversight.
- Admin/observability routes (`/admin*`) require `isAdmin`, checked
  server-side on every request, including the SSE log stream and the stats
  API — never just hidden nav links.

If you add a new mutating route, add its authorization check in the same
function as the mutation, and add a test in `spec/posts-and-opinions.test.ts`
that calls it as the *wrong* user and asserts a 403/404.

## 15. One current opinion per (post, user) is a database guarantee

`opinions` has a real `UNIQUE(post_id, user_id)` constraint, and
`upsertOpinion` (`src/db.ts`) is a single `INSERT ... ON CONFLICT DO UPDATE`
statement. Never "check if an opinion exists, then insert or update" as two
separate statements — that reintroduces the race this schema exists to
prevent. The full concurrency reasoning (why synchronous `node:sqlite`
access makes this safe in a single process, and what a multi-process
deployment would need instead) lives in
`docs/architecture/DATA_MODEL.md`.

## 16. Never fabricate counts, votes, or activity

Per README "Honest results," Buy/Pass counts, opinion lists, and the admin
stats page must always be computed live from the `opinions` table — never a
cached or precomputed "engagement score," and never seeded with fake votes
to make a demo post look more active.

## 17. Structured logging: identifiers only, never content or secrets

`src/logger.ts`'s `logEvent` is the only path that should write to
`activity_events` or stdout for user actions. Never log: passwords, raw
session cookie or CSRF token values, full email addresses, uploaded image
bytes, or free-text content (comments, descriptions, reflections).

## 18. Image uploads: never trust the declared type, never trust the client filename

`src/images.ts`'s `processAndStoreImage` is the only path that writes an
uploaded file to disk. It verifies the file is real by actually decoding it
with `sharp`, re-encodes to JPEG (stripping EXIF/metadata as a side effect),
and stores it under a server-generated opaque UUID filename.

## 19. Unlisted is link-gated, not cryptographically private — say so

An `unlisted` post is excluded from the feed/search/category browsing but is
fully viewable by anyone with its URL. Don't let any UI copy imply unlisted
posts are "private" or "secure" beyond that.

## 20. The recommendation surface is a replaceable interface, not a model

`src/recommendation/types.ts` defines `RecommendationService`;
`src/recommendation/chronological.ts` is the only implementation, explicitly
transparent (category/interest boost, no learned ranking). **Never** fold a
user's BUY/PASS stance into their own interest/affinity signal — voting PASS
on a product is not evidence the voter dislikes that category.

## 21. Protect the Fly volume's Bug Relay data

The live Fly volume still holds Bug Relay's SQLite database at
`/data/bug-relay.db`, from before this pivot. Buy or Pass uses distinct
paths (`DATABASE_PATH=/data/buyorpass.sqlite`, `UPLOAD_DIR=/data/uploads`,
set in `fly.toml`). Never point Buy or Pass's own paths at
`/data/bug-relay.db`, never write a migration or cleanup script that deletes
or reformats the volume, and never run a destructive `flyctl volumes`
command against this app without the student's explicit, in-the-moment
approval.

---

## Current project state

```
PRODUCT:   Buy or Pass — a social shopping-opinion platform. A user posts a
           purchase they're considering; other logged-in users give an
           explicit 👍 Buy / 👎 Pass with a short comment; the author decides
           independently and can later record Bought/Didn't Buy/Still
           Deciding. Migrated from an isolated, fully-verified prototype —
           see docs/adr/0002-pivot-bug-relay-to-buy-or-pass.md.
STACK:     TypeScript on Node 24 (type-stripping, no build step), node:sqlite
           for persistence, Server-Sent Events for real-time sync, plus two
           small npm dependencies (sharp, busboy) for verified image upload
           handling. Rationale in PROCESS.md.
STAGE:     Final Project / Crit 10 — "Fly by instruments." Server-side
           authorization, structured activity logging, a protected
           observability page, and the two-person realtime rehearsal are in
           place; see reflections/crit-10.md and
           docs/architecture/C10_REHEARSAL.md.
```
