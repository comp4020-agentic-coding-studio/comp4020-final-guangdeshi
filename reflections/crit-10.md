# Crit 10 Reflection

## Implementation evidence (factual account)

Crit 10 ("Fly by instruments") required server-enforced authorization,
structured server-side logs, and a two-person demonstration where the
presenter identifies each participant's actions from logs alone, without
operating the app. For the Final Project the product also pivoted again,
from Bug Relay to **Buy or Pass**, a social shopping-opinion platform; the
pivot itself is recorded in `docs/adr/0002-pivot-bug-relay-to-buy-or-pass.md`
and `PROCESS.md`.

What shipped: real database-backed accounts (scrypt password hashing,
HttpOnly session cookies, CSRF protection, rate-limited login/registration);
server-side authorization checked inline in every mutating route handler,
deriving the caller's identity only from the session cookie — a user cannot
edit another user's post or opinion, cannot vote on their own post, and
`/admin*` requires an admin flag checked on every request; structured
activity logs (`src/logger.ts`) writing one JSON line per action to stdout
and to a database table, carrying a request id, a truncated pseudonymous
user id, the action name, the target, success/failure, and latency, while
never logging passwords, tokens, full emails, or free-text content; and a
protected `/admin` page streaming this log live over Server-Sent Events,
with active-user/event/failure counts and an open-reports panel with
resolve/dismiss controls.

The product itself was built and fully verified as an isolated prototype
before migrating into this repository (see `PROCESS.md` for why), with 72
automated tests and real-browser Playwright verification across two
independent browser contexts: registration, a post created with an uploaded
image, a second user's Buy/Pass opinion appearing on the first user's
already-open page without a reload (measured 52-77ms across repeated runs,
well under the ~1 second target), a stance change updating counts live, a
purchase outcome being recorded, a non-admin receiving a real 403 when
visiting `/admin`, and the admin log updating live as a fresh event arrived
with zero page reload. A server-restart test confirmed users, posts,
opinions, and images all persist identically across a restart. The exact
rehearsal procedure for narrating two independent users' actions from the
live log alone is in `docs/architecture/C10_REHEARSAL.md`.

The existing Fly volume's prior Bug Relay database was left untouched —
Buy or Pass uses distinct file paths (`DATABASE_PATH`, `UPLOAD_DIR` in
`fly.toml`) on the same volume, so this pivot neither reads nor overwrites
the previous product's data.

The first live deployment attempt failed: the production machine
crash-looped on out-of-memory kills and served 502s. The cause was
`src/auth.ts`'s scrypt password-hashing parameters, carried over from the
prototype unexamined — `N=131072` costs ~128MB per hash call, consuming
roughly half of this app's 256MB Fly machine on every single boot (a dummy
hash is computed at module load). Fixed by lowering to `N=16384`
(~16MB/call), verified by constraining a local Node process's heap and
confirming registration, login, and a real image upload all stayed well
under budget. Full account in `PROCESS.md`, "A real production incident."

## What was the breakthrough that moved the work forward?

*(Left for the student's own words — this is the part no account written on
their behalf can honestly fill in. The implementation record above is the
factual basis to reflect against; the breakthrough itself was a moment of
understanding, not a line of code, and isn't something to infer or invent
here.)*

## What did this work change about who I want to be as a software developer?

*(Also left for the student. One prompt worth considering while writing it:
this crit required a second product pivot in three weeks, and a decision to
build and verify the new product entirely outside this repository before
bringing it in — both judgement calls about risk and process, not purely
technical ones. What did making that kind of call, rather than a feature
decision, change about how you think about this work?)*
