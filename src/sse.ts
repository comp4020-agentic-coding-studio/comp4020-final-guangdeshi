// Server-Sent Events hub. SSE (not WebSockets) because every event here is
// server -> client only (a post's opinions/counts changed, a new activity
// log line arrived); the client never needs to push a stream back, so SSE's
// plain-HTTP, auto-reconnecting model is the simpler sufficient choice.
//
// Two independent channels:
//  - post rooms: clients viewing a specific post's detail page subscribe to
//    that post's id, so a Buy/Pass update reaches only viewers of that post.
//  - the admin log stream: a separate broadcast for the observability page.
import type { ServerResponse } from "node:http";
import type { ActivityEvent } from "./db.ts";

interface PostClient {
  res: ServerResponse;
  postId: string;
}

const postClients = new Set<PostClient>();
const logClients = new Set<ServerResponse>();

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

export function broadcastToPost(postId: string, event: string, data: unknown): void {
  const payload = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
  for (const client of postClients) {
    if (client.postId === postId) client.res.write(payload);
  }
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
    for (const res of logClients) res.write(":hb\n\n");
  }, intervalMs);
}

export function sseClientCounts(): { postViewers: number; logViewers: number } {
  return { postViewers: postClients.size, logViewers: logClients.size };
}
