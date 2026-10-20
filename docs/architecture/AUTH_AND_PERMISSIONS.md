# Authentication and authorization

Following the course's own framing (Week 10 lecture): **authentication says
who; authorization says what they may change, checked on the server for
every action.** This document covers both, plus the concurrency story that
makes the authorization guarantees actually hold under simultaneous
requests.

## Authentication

- **Password storage**: `node:crypto`'s `scrypt`, not a hand-rolled scheme
  and not a fast general-purpose hash (never MD5/SHA-256 alone). Parameters:
  `N=131072 (2^17), r=8, p=1`, OWASP's current baseline recommendation for a
  dedicated auth server, benchmarked on this machine at ~150-200ms per hash
  — deliberately slow enough to resist offline brute force, fast enough not
  to degrade login UX. A random 16-byte salt is generated per password
  (`randomBytes(16)`); the algorithm name and parameters are encoded
  alongside the salt and hash (`scrypt$N=...,r=...,p=...$salt$hash`) so a
  future parameter upgrade doesn't invalidate already-stored hashes. See
  `src/auth.ts` `hashPassword`/`verifyPassword`.
- **Sessions**: a 32-byte random token is generated at login
  (`randomBytes(32).toString("base64url")`) and set as an `HttpOnly`,
  `SameSite=Lax` cookie (`Secure` added when `NODE_ENV=production`, i.e.
  under real HTTPS). Only the **SHA-256 hash** of the token is stored in the
  `sessions` table — a stolen database backup does not hand over live
  session cookies, mirroring how passwords themselves are never stored in
  recoverable form. Sessions expire 30 days from creation and are deleted on
  logout (`destroySession`) or lazily on first use past expiry
  (`resolveSession`).
- **CSRF**: a "double submit" pattern layered on top of the session. A
  second random token (the CSRF token) is minted per session and handed to
  the client as a **non-HttpOnly** cookie (`bop_csrf`) so same-origin
  JS/templates can read and embed it in forms; only its SHA-256 hash is
  stored server-side (`sessions.csrf_secret`). Every mutating route calls
  `requireCsrf`, which compares the submitted token's hash against the
  session's stored hash using `timingSafeEqual`. A cross-site request that
  automatically carries the session cookie still cannot produce a valid CSRF
  token, because it cannot read the `bop_csrf` cookie value cross-origin
  (browsers don't expose cookie values to a different origin's JS or forms).
- **Rate limiting**: an in-memory, per-process fixed-window limiter
  (`src/auth.ts` `checkRateLimit`) applies to both registration
  (10/IP/10min) and login (20/IP/10min **and** 8/email/10min — both keys are
  checked so one attacker can't spray many accounts from one IP, nor hammer
  one victim's account from many IPs). **Known limitation**: this state is
  per-process, so it would need to move to a shared store (e.g. the SQLite
  database itself, or Redis) behind a load balancer with more than one
  machine — acceptable for the course's single-machine Fly constraint, and
  documented here rather than silently assumed.
- **User-enumeration resistance**: a login attempt against a nonexistent
  email still runs a full `scrypt` verification against a fixed dummy hash
  (`DUMMY_HASH` in `src/server.ts`), so response timing doesn't reveal
  whether an email is registered. This is a partial mitigation (network
  jitter dwarfs the timing difference scrypt alone would introduce), not a
  claim of perfect enumeration-resistance.

## Authorization

Every authorization check lives directly inside the route handler it
protects in `src/server.ts`, not in a separate middleware layer — so a grep
for `auth.user.id !==` or `requireAuth`/`requireAdmin` finds every boundary
in one place. The concrete rules:

| Action | Who may do it | Enforced in |
|---|---|---|
| Edit/delete a post | Its author only (or an admin, for delete) | `handleUpdatePost`, `handleDeletePost` |
| Edit/delete an opinion | Its author only | `handleOpinionMutation` |
| Submit an opinion on a post | Any authenticated user **except** that post's own author | `handleSubmitOpinion` |
| Record a purchase outcome | The post's author only | `handleSetOutcome` |
| View `/admin*` | Users with `is_admin = 1` only | `requireAdmin` |

Every one of these derives "who is calling" from `resolveSession(cookie)`,
never from a client-supplied user ID in the request body — so even a
hand-crafted API request that claims to be acting "as" another user cannot
bypass the check; the session cookie is the only source of identity.

### Provisioning the first admin safely

No admin credential is baked into the app, committed to the repo, or
hardcoded anywhere — `is_admin` defaults to `0` for every new registration,
including whatever accounts are created through the ordinary public
`/register` form for a demo. The first admin is created through
`POST /admin/bootstrap` (`handleAdminBootstrap` in `src/server.ts`), gated
by an `ADMIN_BOOTSTRAP_SECRET` environment variable:

1. Set the secret on the live app once, out-of-band, via
   `flyctl secrets set ADMIN_BOOTSTRAP_SECRET=<a long random value> -a comp4020-final-guangdeshi`
   (never committed; `flyctl secrets` stores it encrypted and it is never
   logged or returned by any route).
2. Register a normal account through the public `/register` form.
3. While logged in as that account, `POST /admin/bootstrap` with
   `secret=<the same value>` (e.g. `curl -b cookies.txt -d
   "secret=..." https://comp4020-final-guangdeshi.fly.dev/admin/bootstrap`).
4. That account is now the admin; `/admin/bootstrap` immediately starts
   rejecting every further call with 409, since `anyAdminExists()` is now
   true — there is no path to create a second admin this way, intentionally.

If `ADMIN_BOOTSTRAP_SECRET` is never set (e.g. a fresh deploy before anyone
has configured it), the route returns a plain 404 — indistinguishable from a
route that doesn't exist — rather than, say, accepting any secret or
exposing that the route exists at all. The comparison uses
`timingSafeEqual` against the configured secret so response timing doesn't
leak how many characters of a guess were correct.

### Why post authors can't vote on their own posts

This is a deliberate product rule (see `README.md` "Buyer agency"), not an
oversight: opinions exist to bring outside perspective to a decision the
author is already inside of. Allowing self-voting would let an author pad
their own "Buy" count, undermining the "honest results" principle.
Enforced server-side in `handleSubmitOpinion`, independent of what the UI
shows — the opinion form is hidden for the author client-side too, but that
alone would not stop a direct API call, which is why the server check
exists as the actual guarantee.

## Concurrency: how "no duplicate opinions" actually holds under load

`node:sqlite`'s API is synchronous, and every function in `src/db.ts` runs
to completion within a single synchronous call — there is no `await`
between reading an opinion's current state and writing its new state inside
`upsertOpinion`. Combined with Node's single-threaded event loop, this means
two "simultaneous" HTTP requests for the same `(post_id, user_id)` are
never actually interleaved at the JavaScript level: whichever request's
callback runs first completes its full database operation before the second
one starts. The database's own `UNIQUE (post_id, user_id)` constraint plus
the `INSERT ... ON CONFLICT DO UPDATE` statement is the actual safety net
even in a scenario where that single-threaded assumption didn't hold (e.g. a
future multi-process deployment) — `spec/posts-and-opinions.test.ts`
verifies this directly by firing 8 concurrent opinion submissions from one
user and asserting exactly one row results.

## What this does not protect against (honest limitations)

- **Single-machine deployment only.** Rate limiting and SSE broadcast state
  are per-process. A multi-machine deployment would need shared state (a
  database-backed rate limiter, a pub/sub layer for SSE broadcast) — out of
  scope for the course's one-machine Fly constraint, but a real limitation
  if this were ever deployed at larger scale.
- **CSRF cookie is not `HttpOnly` by design** (it must be readable by
  same-origin JS to embed in forms) — this is the standard double-submit
  trade-off, not an oversight; what it protects against (a third-party site
  forging a request) is still fully covered, since a third-party page cannot
  read `bop_csrf`'s value.
- **No email verification.** Registration accepts any syntactically valid
  email with no confirmation step — acceptable for a prototype with
  disposable test accounts, called out explicitly rather than implied to be
  production-grade identity verification.
