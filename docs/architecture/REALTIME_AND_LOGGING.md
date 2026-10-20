# Real-time behavior and structured logging

## Real-time: SSE, not WebSockets

Every live event in this product is server→client only: a new opinion, an
updated Buy/Pass count, a recorded purchase outcome. The client never needs
to push a stream of its own data back over the same connection (opinion
submission is a normal POST, not a stream write). Given that, Server-Sent
Events were chosen over WebSockets because SSE is plain HTTP (no protocol
upgrade), auto-reconnects natively in the browser's `EventSource`, and adds
no complexity this product doesn't need. This mirrors the same reasoning
used in the sibling course prototypes (`looktogether-prototype`,
`skillloop-prototype`).

### Two independent channels (`src/sse.ts`)

- **Per-post rooms**: a client viewing `/posts/:id` subscribes to
  `/posts/:id/events`; `broadcastToPost(postId, event, data)` only reaches
  clients currently viewing that specific post, not every connected client —
  so opening 100 different post pages doesn't mean every opinion submission
  anywhere broadcasts to everyone.
- **Admin log stream**: a separate `/admin/events` channel for the
  observability page, broadcasting every `activity_events` row as it's
  written, independent of which post (if any) it relates to.

### What's pushed

| Event | Payload | Trigger |
|---|---|---|
| `opinion-upserted` | the opinion (id, stance, comment, author handle) + fresh counts | a Buy/Pass submission or stance change |
| `opinion-deleted` | opinionId, userId, fresh counts | an opinion is deleted |
| `outcome-updated` | the outcome record | author records Bought/Didn't Buy/Still Deciding |
| `post-updated` | postId | the post's own fields change |

### Reconnection and authoritative state

`EventSource` reconnects automatically on a dropped connection (the browser
's native behavior); on reconnect, the client re-fetches the post detail
page fresh (a normal page load/reload), which re-reads current database
state rather than relying on any client-side cache of prior events — so a
missed event during a brief disconnect is never silently lost, it's just
picked up on the next full state read. The server itself is the sole source
of truth: every pushed event's payload (counts, stance, comment) comes
directly from a fresh database query at the moment of the write, never from
in-memory application state that could drift from the database.

### Measured propagation time

`spec/realtime.test.ts` subscribes to a post's raw SSE stream (the same
wire protocol `EventSource` uses) and measures the time between a second
user's opinion POST completing and the event arriving on the open stream —
asserted under 1000ms, and in practice measured in the tens of milliseconds
on localhost (network latency, not server processing, would dominate in a
real deployment). `scripts/verify-browser.mjs` repeats the same measurement
through real Chromium tabs end-to-end.

## Structured logging (C10 "Fly by instruments")

### Schema

Every event (`src/logger.ts` `logEvent`) carries:

```
timestamp (ts)       — ISO 8601
requestId             — correlates every log line from one HTTP request
userId                — the authenticated user, or null for anonymous
action                — e.g. "opinion.created", "authorization.denied"
targetType/targetId   — what the action acted on (e.g. "post", a post id)
status                — "success" | "failure"
latencyMs             — request processing time, when applicable
meta                  — small structured extras, with sensitive keys redacted
```

Each event is written to **two** places simultaneously: one JSON line to
stdout (so `fly logs` in a real deployment, or the dev terminal locally, sees
it live — per the course's "five places logs live"), and one row to the
`activity_events` table (so the row survives independent of stdout
retention, and the admin observability page can serve history on page load
without re-parsing log text).

### What is never logged

Per CLAUDE.md and the brief: passwords, raw session cookie or CSRF token
values, full email addresses, uploaded image bytes, and free-text content
(opinion comments, post descriptions, outcome reflections). `logEvent`'s
`scrubMeta` redacts any `meta` key matching a known-sensitive name
(`password`, `comment`, `description`, `reflection`, `token`, `cookie`,
`email`) as defense in depth, but the actual discipline is that these values
are never passed into `meta` in the first place — only identifiers.

### Live observability (`/admin`)

A protected page (admin-only, server-checked on every request including the
SSE stream itself) shows:

- **Live event log** — streamed via the admin SSE channel, newest first,
  capped at 200 visible rows client-side.
- **Stats** — active users and total/failed event counts in the last hour,
  polled every 5s from `/admin/api/stats`.
- **Open reports** — user-filed reports against posts/opinions, polled every
  15s from `/admin/api/reports`.

### The C10 rehearsal: narrating from logs alone

Because every event carries a `userId` (truncated to its first 8 characters
for log display, by `pseudonymForUser`) and an `action`/`targetType`/
`targetId`, a presenter watching `/admin` (or tailing stdout) can narrate
"user `a1b2c3d4` just created a post," "user `e5f6g7h8` submitted a BUY
opinion on post `12345678`," or "user `e5f6g7h8` was denied — tried to edit
a post they don't own" purely from the log stream, without needing to look
at the application UI themselves. See
`docs/architecture/C10_REHEARSAL.md` (if present) or `PROCESS.md` for the
exact rehearsal script used to verify this.

### Known limitation

Activity events accumulate in the `activity_events` table indefinitely in
this prototype — there's no retention/rotation policy. For a real multi-week
deployment this would need either a TTL-based cleanup job or periodic
archival; out of scope for this phase, noted here rather than silently
assumed to be handled.
