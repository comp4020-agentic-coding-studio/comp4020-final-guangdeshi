# ADR 0005: One real-time contract — events say what changed, the server renders what it looks like

## Status

Accepted. Implemented after the 2026-11-03 acceptance audit.

## Context

The brief requires that a change "appears in every other open session
showing it within about a second, with no reload or other action by the
viewer." Before this change, only Buy/Pass and Which One? votes met that
bar. The audit, run with two independent browser contexts, found that:

- a new public question never reached another user's open Discover feed
  (Discover had no event channel at all);
- `post-updated` was broadcast but no page listened for it, so edits needed a
  reload;
- a recorded outcome or influential marker only showed a "refresh to see it"
  banner;
- an opinion arriving live lacked the author-only "Mark as influential"
  action, because the client built the row itself and couldn't know the
  viewer's permissions;
- a deleted opinion stayed on other viewers' screens, because the client
  looked it up by opinion id in an attribute holding the user id;
- deleting a post broadcast nothing.

The common cause was that each event carried a payload which the client
turned into HTML by hand. That only worked where the HTML was simple and
identical for every viewer.

## Decision

**An event says what changed. The viewer's own page is re-rendered by the
server.**

Channels (`src/sse.ts`):

| Route | Who listens | Events |
|---|---|---|
| `GET /posts/:id/events` | the post's detail page | `opinion-upserted`, `opinion-deleted`, `post-updated`, `post-removed`, `outcome-updated` |
| `GET /discover/events` | Discover (both views) and product pages | `feed-changed` with `kind: created \| updated \| removed` |
| `GET /admin/events` | admin page (unchanged) | `activity` |

Every post and feed payload carries `postId`, a process-wide monotonically
increasing `rev`, and a `ts`, plus the minimum needed for a fast first paint:

- vote counts and the opinion itself for opinion events;
- the opinion id for deletions;
- nothing else.

Feed events carry **only the post id**, never a title.

On any event, `app.js`'s `createLiveReconciler` refetches the page's own URL.
The server renders that page for this viewer, with this viewer's session,
filters, sort and page. The client then swaps every `[data-live-region]`
whose HTML differs. This gives the following guarantees:

- **Permissions and privacy** are decided by the same server code that
  renders a normal page load.
  - The author sees "Mark as influential" on a just-arrived opinion; nobody
    else does.
  - An unlisted or demo post is never in a feed region, because the feed query
    excludes it. Its feed event is never sent either: `announceFeedChange`
    only fires for posts that are, or just stopped being, public, active and
    non-demo.
- **Filters** need no client logic. The refetched page holds exactly what the
  server's own query returns for this URL, so a new computing question never
  appears in an audio-filtered feed. A post made unlisted or deleted drops out
  of the feed on the next reconcile.
- **Ordering and duplication.**
  - Each fetch gets a ticket, and a response is applied only if no newer fetch
    has started since, so a slow, stale response can't roll the page back.
  - Bursts are coalesced: one fetch is in flight and at most one more is
    queued.
  - Opinion rows are keyed by opinion id, and one current opinion per account
    is a database constraint, so a changed opinion replaces its row rather
    than adding one.
- **Unsaved input is never overwritten.** The viewer's opinion form and the
  author's outcome form are skipped while they have focus or text that
  differs from the server's.
- **Reconnects.** SSE events are not replayed. Instead, every EventSource
  `open` after the first runs a reconcile, which repairs anything missed
  while offline. No event history is kept in memory. This is deliberate,
  given the 256MB machine.
- **Broadcast only after commit.** Every `db.ts` write is a synchronous
  `node:sqlite` statement or an explicit `BEGIN`/`COMMIT`, and broadcasts
  sit after the call returns. A rejected request (failed validation, failed
  authorization) returns or throws before reaching the broadcast. The spec
  checks this for a cross-user edit attempt.

Opinion events keep their original fast path: counts and the row are applied
from the payload immediately, then the reconcile follows.

## Alternatives considered

- **Hand-building every section client-side from richer payloads.** This
  would duplicate `pages.ts` in `app.js` and need a payload per viewer, since
  author controls differ. Each viewer-specific detail would be another place
  for the two copies to drift. That drift is exactly the bug class the audit
  found.
- **Polling.** Simple, but per-viewer polling fast enough for "about a
  second" multiplies request load on a single shared-cpu machine, even while
  nothing changes.
- **WebSockets.** Every stream here is server-to-client only. SSE is already
  in use, reconnects automatically, and is plain HTTP through Fly's proxy.
  Nothing here needs a bidirectional channel.

## Costs

- A reconcile re-renders one page per open viewer per event. That's cheap
  for this app's pages, but it is O(viewers) work per change. A large
  audience would want per-region fragment endpoints or server-side caching
  instead.
- The landing page's "recent questions" strip is not live. It's a static
  preview; Discover is the live surface.
- Product cards on the Products tab show the live count of real questions
  through the same reconcile. They are never seeded or estimated.

## Verification

- `spec/realtime-contract.test.ts` checks, over raw SSE, what each mutation
  broadcasts, including that unlisted posts and rejected writes broadcast
  nothing and that `rev` increases.
- `scripts/verify-realtime.mjs` runs two simultaneously open browser
  contexts (1440x900 and 390x844) through the full acceptance matrix:
  - new post in an open feed;
  - edit;
  - Buy→Pass;
  - Which One? pick and change;
  - opinion delete;
  - outcomes;
  - influential mark and unmark;
  - filtered and unlisted feeds;
  - reconnect after going offline;
  - concurrent voters;
  - overflow at three viewports.

  It records both end-to-end latency (request dispatch to visible) and
  commit-to-visible latency (the server's event `ts` to visible).
