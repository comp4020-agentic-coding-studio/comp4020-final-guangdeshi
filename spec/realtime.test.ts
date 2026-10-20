// TEST D/E from the brief, over raw SSE rather than a browser: subscribe to
// a post's event stream the way the client's EventSource does, then confirm
// a second user's opinion arrives as a server-pushed event — not something
// the viewer had to poll or refresh for — and measure how long it takes.
// scripts/verify-browser.mjs covers the same requirement end-to-end through
// real Chromium tabs; this test isolates just the SSE wire protocol so a
// regression here fails fast without needing a browser.
import { describe, expect, it } from "vitest";
import { baseUrl, createPost, registerUser, submitOpinion } from "./helpers.ts";

function readSseEvents(res: Response, onEvent: (eventName: string, data: string) => void): () => void {
  const reader = res.body!.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let stopped = false;

  (async () => {
    while (!stopped) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const chunks = buffer.split("\n\n");
      buffer = chunks.pop() ?? "";
      for (const chunk of chunks) {
        const lines = chunk.split("\n");
        const eventLine = lines.find((l) => l.startsWith("event: "));
        const dataLine = lines.find((l) => l.startsWith("data: "));
        if (eventLine && dataLine) {
          onEvent(eventLine.slice("event: ".length), dataLine.slice("data: ".length));
        }
      }
    }
  })().catch(() => {});

  return () => {
    stopped = true;
    reader.cancel().catch(() => {});
  };
}

describe("real-time propagation", () => {
  it("pushes a new opinion to an open post stream without the viewer polling, in well under a second", async () => {
    const alice = await registerUser();
    const bob = await registerUser();
    const postId = await createPost(alice);

    const streamRes = await fetch(new URL(`/posts/${postId}/events`, baseUrl()));
    expect(streamRes.status).toBe(200);
    expect(streamRes.headers.get("content-type")).toContain("text/event-stream");

    const received: { eventName: string; data: any; receivedAt: number }[] = [];
    const stop = readSseEvents(streamRes, (eventName, data) => {
      received.push({ eventName, data: JSON.parse(data), receivedAt: Date.now() });
    });

    // Give the stream a moment to fully establish before the triggering action.
    await new Promise((resolve) => setTimeout(resolve, 100));
    const t0 = Date.now();
    await submitOpinion(bob, postId, "BUY", "Live update test opinion");

    const deadline = Date.now() + 5000;
    while (Date.now() < deadline && !received.some((e) => e.eventName === "opinion-upserted")) {
      await new Promise((resolve) => setTimeout(resolve, 20));
    }
    stop();

    const event = received.find((e) => e.eventName === "opinion-upserted");
    expect(event, "expected an opinion-upserted SSE event").toBeTruthy();
    expect(event!.data.counts).toEqual({ buy: 1, pass: 0 });
    expect(event!.data.opinion.comment).toBe("Live update test opinion");

    const elapsedMs = event!.receivedAt - t0;
    expect(elapsedMs).toBeLessThan(1000);
  });

  it("broadcasts a stance change to all open viewers of the same post", async () => {
    const alice = await registerUser();
    const bob = await registerUser();
    const postId = await createPost(alice);
    await submitOpinion(bob, postId, "BUY", "Initial stance");

    const streamRes = await fetch(new URL(`/posts/${postId}/events`, baseUrl()));
    const received: { eventName: string; data: any }[] = [];
    const stop = readSseEvents(streamRes, (eventName, data) => received.push({ eventName, data: JSON.parse(data) }));
    await new Promise((resolve) => setTimeout(resolve, 100));

    await submitOpinion(bob, postId, "PASS", "Changed to pass");

    const deadline = Date.now() + 5000;
    while (Date.now() < deadline && !received.some((e) => e.data?.counts?.pass === 1)) {
      await new Promise((resolve) => setTimeout(resolve, 20));
    }
    stop();

    const event = received.find((e) => e.data?.counts?.pass === 1);
    expect(event).toBeTruthy();
    expect(event!.data.counts).toEqual({ buy: 0, pass: 1 });
  });
});
