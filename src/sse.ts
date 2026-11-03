// Server-Sent Events hub. SSE (not WebSockets) because every event here is
// server -> client only (a post's opinions/counts changed, a new activity
// log line arrived); the client never needs to push a stream back, so SSE's
// plain-HTTP, auto-reconnecting model is the simpler sufficient choice.
//
// Three independent channels (event contract: docs/adr/0005-realtime-event-contract.md):
//  - post rooms: clients viewing a specific post's detail page subscribe to
//    that post's id, so a Buy/Pass update reaches only viewers of that post.
//  - the feed: clients viewing Discover's Questions view (or a product page's
//    question list) hear that some public post changed, then refetch their
//    own server-rendered view — the event itself carries no content.
//  - the admin log stream: a separate broadcast for the observability page.
//
// Every post/feed event carries a process-wide monotonically increasing
// `rev` and a timestamp. Clients use them only to order and de-duplicate
// their own refetches; the server-rendered page is always the source of
// truth, so a missed event (e.g. during a reconnect) is repaired by the
// reconcile every client runs on (re)connect, not by replaying history —
// nothing here keeps an event log in memory.
import type { ServerResponse } from "node:http";
import type { ActivityEvent } from "./db.ts";

interface PostClient {
  res: ServerResponse;
  postId: string;
}

const postClients = new Set<PostClient>();
const feedClients = new Set<ServerResponse>();
const logClients = new Set<ServerResponse>();

let rev = 0;
/** Stamps an event with the next revision and the current time. */
function stamp<T extends object>(data: T): T & { rev: number; ts: string } {
  rev += 1;
  return { ...data, rev, ts: new Date().toISOString() };
}

function startStream(res: ServerResponse): void {
  res.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache",
    Connection: "keep-alive",
    "X-Accel-Buffering": "no",
  });
  res.write(":ok\n\n");
}

export function addPostClient(res: ServerResponse, postId: string): void {
  startStream(res);
  const entry: PostClient = { res, postId };
  postClients.add(entry);
  res.on("close", () => postClients.delete(entry));
}

export type PostEvent = "opinion-upserted" | "opinion-deleted" | "post-updated" | "post-removed" | "outcome-updated";

/**
 * Call only after the write it reports has returned: every db.ts write is a
 * synchronous node:sqlite statement or an explicit BEGIN/COMMIT block, so by
 * then the change is committed and a refetch will see it.
 */
export function broadcastToPost(postId: string, event: PostEvent, data: object): void {
  const payload = `event: ${event}\ndata: ${JSON.stringify(stamp({ postId, ...data }))}\n\n`;
  for (const client of postClients) {
    if (client.postId === postId) client.res.write(payload);
  }
}

export function addFeedClient(res: ServerResponse): void {
  startStream(res);
  feedClients.add(res);
  res.on("close", () => feedClients.delete(res));
}

/**
 * Tells feed viewers that a post entered, changed within, or left the public
 * feed. Only the post id travels: whether (and how) it shows for a given
 * viewer's filters is decided when that viewer refetches its own page, so an
 * unlisted or demo post's title can never leak through this channel.
 */
export function broadcastFeedChange(postId: string, kind: "created" | "updated" | "removed"): void {
  const payload = `event: feed-changed\ndata: ${JSON.stringify(stamp({ postId, kind }))}\n\n`;
  for (const res of feedClients) res.write(payload);
}

export function addLogClient(res: ServerResponse): void {
  startStream(res);
  logClients.add(res);
  res.on("close", () => logClients.delete(res));
}

export function broadcastLog(event: Omit<ActivityEvent, "id">): void {
  const payload = `event: activity\ndata: ${JSON.stringify(event)}\n\n`;
  for (const res of logClients) res.write(payload);
}

export function startHeartbeat(intervalMs = 20000): NodeJS.Timeout {
  return setInterval(() => {
    for (const client of postClients) client.res.write(":hb\n\n");
    for (const res of feedClients) res.write(":hb\n\n");
    for (const res of logClients) res.write(":hb\n\n");
  }, intervalMs);
}

export function sseClientCounts(): { postViewers: number; feedViewers: number; logViewers: number } {
  return { postViewers: postClients.size, feedViewers: feedClients.size, logViewers: logClients.size };
}
