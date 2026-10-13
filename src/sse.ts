import type { ServerResponse } from "node:http";

// Live, in-memory presence/broadcast only — explicitly separate from the
// SQLite evidence in db.ts. If the process restarts, every connection drops
// and reconnects (client-side EventSource retries automatically); nothing
// here needs to survive that, since the authoritative state it announces is
// always re-fetched from the database on (re)connect, never reconstructed
// from this registry.
const rooms = new Map<string, Set<ServerResponse>>();

export function subscribe(caseId: string, res: ServerResponse): () => void {
  let set = rooms.get(caseId);
  if (!set) {
    set = new Set();
    rooms.set(caseId, set);
  }
  set.add(res);
  return () => {
    set!.delete(res);
    if (set!.size === 0) rooms.delete(caseId);
  };
}

export function presenceCount(caseId: string): number {
  return rooms.get(caseId)?.size ?? 0;
}

export function broadcast(caseId: string, event: string, data: unknown): void {
  const set = rooms.get(caseId);
  if (!set || set.size === 0) return;
  const payload = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
  for (const res of set) {
    res.write(payload);
  }
}

export function sseHeaders(): Record<string, string> {
  return {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache, no-transform",
    Connection: "keep-alive",
    // Fly's proxy (and some reverse proxies in general) buffer by default;
    // this disables that so events actually flush within the ~1s budget
    // rather than arriving in a batch when the buffer fills.
    "X-Accel-Buffering": "no",
  };
}
