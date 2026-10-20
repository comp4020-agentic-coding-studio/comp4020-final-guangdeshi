# C10 rehearsal script: "Fly by instruments"

This is a repeatable two-person demonstration for Crit 10, run locally
against this isolated prototype. **This document does not claim C10 has
been officially submitted or deployed** — see `README.md` and `PROCESS.md`
for what remains before any migration to the official course repository.

`scripts/verify-admin.mjs` (`pnpm test:admin`) automates the mechanics this
rehearsal depends on — two independent browser contexts, a report filed and
resolved, and the admin log updating live with no page reload — as a
repeatable regression check, independent of the live two-person walkthrough
below.

## Setup

1. Start the app: `pnpm dev` (or the Docker image), confirm it's reachable at
   `http://localhost:8080`.
2. Open `/admin` in a third, separate browser tab/profile, logged in as a
   user with `is_admin = 1` (see `PROCESS.md` for how to grant this to a
   local test account). This is the **presenter's** tab — the only one they
   watch during the demo.
3. Person A opens the app in Chrome Profile 1 (or an incognito window).
4. Person B opens the app in Chrome Profile 2 (a **separate** profile or a
   second incognito window — they must share no cookies with Person A).

## Script

| Step | Actor | Action | What the presenter should see in `/admin`'s live log |
|---|---|---|---|
| 1 | A | Registers a new account | `auth.registered`, `userId=<A's id prefix>`, `status=success` |
| 2 | A | Creates a post with a photo | `post.created`, `userId=<A>`, `targetType=post`, `status=success` |
| 3 | B | Registers a separate new account | `auth.registered`, `userId=<B's id prefix>` — **different from A's** |
| 4 | B | Opens A's post | `post.opened`, `userId=<B>`, `targetId=<post id>` |
| 5 | B | Submits 👍 Buy with a comment | `opinion.created`, `userId=<B>`, `meta.stance=BUY` |
| 6 | A | (on their already-open post page) sees the new opinion and count appear **without refreshing** | (no new log line needed for this — it's the SSE push the server already logged in step 5) |
| 7 | B | Changes their stance to 👎 Pass | `opinion.updated`, `userId=<B>`, `meta.stance=PASS` |
| 8 | A | Sees the count flip live | (same SSE push from step 7) |
| 9 | A | Attempts (via browser devtools or a crafted request) to edit B's opinion or B's account | `authorization.denied`, `userId=<A>`, `status=failure` |
| 10 | — | Presenter narrates all of the above **from the log alone**, identifying which pseudonymous user id corresponds to which role (A = post creator, B = opinion giver) purely from the sequence of actions in the log — never looking at either person's screen |

## What makes this work mechanically

- **Distinct identities**: every event's `userId` is the real account id
  (truncated for display), making A and B trivially distinguishable in the
  log — see `docs/architecture/REALTIME_AND_LOGGING.md`.
- **No secrets in logs**: the presenter can show this log on a shared screen
  during the crit without redacting anything — passwords, session tokens,
  comment text, and emails are never written to `activity_events` or stdout
  (see `CLAUDE.md` rule 5).
- **Server-enforced authorization, visible as a failure, not a silent
  no-op**: step 9's denial produces an explicit `authorization.denied` log
  line with a 403 response — not a silently-ignored request that would leave
  the presenter unable to show *that* the system actually blocked it.

## Honest gaps versus the official C10 requirement

- This rehearsal runs against `localhost`, not a deployed `*.fly.dev` URL —
  the official crit requires the app be reachable "from its URL alone," with
  nothing pre-shared between the two testers. That requires deploying this
  prototype (or migrating it into the official Final repository) first,
  which has not happened here per the explicit instruction not to deploy
  without separate approval.
- The official crit's suggested log-tailing command
  (`mise exec -- flyctl logs -a <repo>`) assumes a live Fly deployment; the
  local equivalent demonstrated here is tailing the dev server's stdout or
  watching `/admin`'s live log view, which exercises the same logging code
  path but not the actual Fly log pipeline.
