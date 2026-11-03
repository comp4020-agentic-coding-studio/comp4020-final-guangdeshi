// The real-time event contract (docs/adr/0005-realtime-event-contract.md),
// over raw SSE against the shared test server. These pin what each mutation
// broadcasts — and, as importantly, what it must NOT broadcast — so the
// browser-level checks in scripts/verify-realtime.mjs have a fast, browserless
// backstop. Also covers the two acceptance-audit fixes that live on the same
// request paths: the login return-path for "Ask about this product", and
// opinion validation reached by an eligible non-owner.
import { describe, expect, it } from "vitest";
import { apiCall, baseUrl, cookieHeader, createPost, registerUser, submitOpinion, type Session } from "./helpers.ts";

interface SseEvent {
  event: string;
  data: any;
}

/** Opens an SSE stream and collects its events until stopped. */
async function openStream(path: string): Promise<{ events: SseEvent[]; stop: () => void; waitFor: (pred: (e: SseEvent) => boolean, ms?: number) => Promise<SseEvent | undefined> }> {
  const res = await fetch(new URL(path, baseUrl()));
  expect(res.status).toBe(200);
  const reader = res.body!.getReader();
  const decoder = new TextDecoder();
  const events: SseEvent[] = [];
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
        const ev = lines.find((l) => l.startsWith("event: "));
        const data = lines.find((l) => l.startsWith("data: "));
        if (ev && data) events.push({ event: ev.slice(7), data: JSON.parse(data.slice(6)) });
      }
    }
  })().catch(() => {});
  // Let the subscription register server-side before the caller acts.
  await new Promise((r) => setTimeout(r, 100));
  return {
    events,
    stop: () => {
      stopped = true;
      reader.cancel().catch(() => {});
    },
    waitFor: async (pred, ms = 3000) => {
      const deadline = Date.now() + ms;
      while (Date.now() < deadline) {
        const hit = events.find(pred);
        if (hit) return hit;
        await new Promise((r) => setTimeout(r, 20));
      }
      return undefined;
    },
  };
}

function form(session: Session, fields: Record<string, string>): RequestInit {
  return {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ csrf: session.csrfToken, ...fields }),
  };
}

async function editPost(session: Session, postId: string, fields: Record<string, string>): Promise<Response> {
  const body = new FormData();
  body.set("csrf", session.csrfToken);
  for (const [k, v] of Object.entries(fields)) body.set(k, v);
  return fetch(new URL(`/posts/${postId}/edit`, baseUrl()), { method: "POST", redirect: "manual", headers: { Cookie: cookieHeader(session) }, body });
}

async function opinionIdOf(postId: string, author: Session): Promise<string> {
  const html = await (await fetch(new URL(`/posts/${postId}`, baseUrl()), { headers: { Cookie: cookieHeader(author) } })).text();
  const m = html.match(/data-opinion-id="([a-f0-9-]{36})"/);
  if (!m) throw new Error("no opinion on page");
  return m[1];
}

describe("feed channel: /discover/events", () => {
  it("announces a new public post by id only — no title or content travels over the channel", async () => {
    const feed = await openStream("/discover/events");
    const alice = await registerUser();
    const title = `Feed contract public ${Date.now()}`;
    const postId = await createPost(alice, { title });
    const ev = await feed.waitFor((e) => e.event === "feed-changed" && e.data.postId === postId);
    feed.stop();
    expect(ev?.data.kind).toBe("created");
    expect(typeof ev?.data.rev).toBe("number");
    expect(JSON.stringify(ev?.data)).not.toContain(title);
  });

  it("never announces an unlisted post, so its existence can't leak", async () => {
    const feed = await openStream("/discover/events");
    const alice = await registerUser();
    const postId = await createPost(alice, { title: `Unlisted ${Date.now()}`, visibility: "unlisted" });
    await new Promise((r) => setTimeout(r, 400));
    feed.stop();
    expect(feed.events.some((e) => e.data.postId === postId)).toBe(false);
  });

  it("announces removal when a public post is deleted or made unlisted", async () => {
    const alice = await registerUser();
    const a = await createPost(alice, { title: "Will be unlisted" });
    const b = await createPost(alice, { title: "Will be deleted" });
    const feed = await openStream("/discover/events");
    await editPost(alice, a, { title: "Will be unlisted", description: "d", category: "computing", visibility: "unlisted" });
    await apiCall(alice, `/posts/${b}/delete`, form(alice, {}));
    const unlisted = await feed.waitFor((e) => e.data.postId === a);
    const deleted = await feed.waitFor((e) => e.data.postId === b);
    feed.stop();
    expect(unlisted?.data.kind).toBe("removed");
    expect(deleted?.data.kind).toBe("removed");
  });

  it("revisions increase monotonically across events", async () => {
    const feed = await openStream("/discover/events");
    const alice = await registerUser();
    await createPost(alice);
    await createPost(alice);
    await feed.waitFor(() => feed.events.length >= 2);
    feed.stop();
    const revs = feed.events.map((e) => e.data.rev);
    expect(revs.length).toBeGreaterThanOrEqual(2);
    for (let i = 1; i < revs.length; i++) expect(revs[i]).toBeGreaterThan(revs[i - 1]);
  });
});

describe("post channel: /posts/:id/events", () => {
  it("broadcasts post-updated when the author edits, and post-removed when they delete", async () => {
    const alice = await registerUser();
    const postId = await createPost(alice);
    const stream = await openStream(`/posts/${postId}/events`);
    const res = await editPost(alice, postId, { title: "Edited title", description: "Edited", category: "computing", visibility: "public" });
    expect(res.status).toBe(303);
    expect(await stream.waitFor((e) => e.event === "post-updated")).toBeTruthy();
    await apiCall(alice, `/posts/${postId}/delete`, form(alice, {}));
    expect(await stream.waitFor((e) => e.event === "post-removed")).toBeTruthy();
    stream.stop();
  });

  it("a rejected edit (wrong user) broadcasts nothing", async () => {
    const alice = await registerUser();
    const mallory = await registerUser();
    const postId = await createPost(alice);
    const stream = await openStream(`/posts/${postId}/events`);
    const res = await editPost(mallory, postId, { title: "hijack", description: "x", category: "computing", visibility: "public" });
    expect(res.status).toBe(403);
    await new Promise((r) => setTimeout(r, 300));
    stream.stop();
    expect(stream.events).toEqual([]);
  });

  it("broadcasts opinion-deleted with the opinion's own id and the corrected counts", async () => {
    const alice = await registerUser();
    const bob = await registerUser();
    const postId = await createPost(alice);
    await submitOpinion(bob, postId, "BUY", "to delete");
    const opinionId = await opinionIdOf(postId, alice);
    const stream = await openStream(`/posts/${postId}/events`);
    const res = await apiCall(bob, `/opinions/${opinionId}/delete`, form(bob, {}));
    expect(res.status).toBe(200);
    const ev = await stream.waitFor((e) => e.event === "opinion-deleted");
    stream.stop();
    expect(ev?.data.opinionId).toBe(opinionId);
    expect(ev?.data.counts).toEqual({ buy: 0, pass: 0 });
  });

  it("broadcasts outcome-updated for outcomes and for marking/unmarking an influential opinion", async () => {
    const alice = await registerUser();
    const bob = await registerUser();
    const postId = await createPost(alice);
    await submitOpinion(bob, postId, "PASS", "influential one");
    const opinionId = await opinionIdOf(postId, alice);
    const stream = await openStream(`/posts/${postId}/events`);
    await apiCall(alice, `/posts/${postId}/outcome`, form(alice, { status: "BOUGHT", reflection: "" }));
    await apiCall(alice, `/posts/${postId}/opinions/${opinionId}/influential`, form(alice, { action: "mark" }));
    await apiCall(alice, `/posts/${postId}/opinions/${opinionId}/influential`, form(alice, { action: "unmark" }));
    await stream.waitFor(() => stream.events.filter((e) => e.event === "outcome-updated").length >= 3);
    stream.stop();
    const outcomes = stream.events.filter((e) => e.event === "outcome-updated");
    expect(outcomes.map((e) => e.data.status ?? e.data.influentialOpinionId ?? null)).toEqual(["BOUGHT", opinionId, null]);
  });

  it("the post page carries the regions and ids the client reconciles by", async () => {
    const alice = await registerUser();
    const bob = await registerUser();
    const postId = await createPost(alice);
    await submitOpinion(bob, postId, "BUY", "region check");
    const html = await (await fetch(new URL(`/posts/${postId}`, baseUrl()), { headers: { Cookie: cookieHeader(alice) } })).text();
    for (const region of ["header", "context", "summary", "opinion-form", "outcome", "opinions"]) {
      expect(html, region).toContain(`data-live-region="${region}"`);
    }
    // The author's live-rendered view includes the influential action for the new opinion.
    expect(html).toContain("influential-mark-form");
    expect(html).toMatch(/data-opinion-id="[a-f0-9-]{36}"/);
  });

  it("deleting a marked influential opinion clears the marker (ON DELETE SET NULL)", async () => {
    const alice = await registerUser();
    const bob = await registerUser();
    const postId = await createPost(alice);
    await submitOpinion(bob, postId, "BUY", "marked then deleted");
    const opinionId = await opinionIdOf(postId, alice);
    await apiCall(alice, `/posts/${postId}/opinions/${opinionId}/influential`, form(alice, { action: "mark" }));
    await apiCall(bob, `/opinions/${opinionId}/delete`, form(bob, {}));
    const html = await (await fetch(new URL(`/posts/${postId}`, baseUrl()))).text();
    expect(html).not.toContain("Influenced the decision");
    expect(html).not.toContain(opinionId);
  });
});

describe("Ask about this product while logged out", () => {
  it("redirects to log in with the prefilled form as the return path", async () => {
    const res = await fetch(new URL("/posts/new?product=abo-b07pdyw6vm", baseUrl()), { redirect: "manual" });
    expect(res.status).toBe(303);
    const target = new URL(res.headers.get("location")!, baseUrl());
    expect(target.pathname).toBe("/login");
    expect(target.searchParams.get("next")).toBe("/posts/new?product=abo-b07pdyw6vm");
  });

  it("logging in (or registering) returns to the prefilled form", async () => {
    const user = await registerUser();
    const login = await fetch(new URL("/login", baseUrl()), {
      method: "POST",
      redirect: "manual",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ email: user.email, password: "password123", next: "/posts/new?product=abo-b07pdyw6vm" }),
    });
    expect(login.status).toBe(303);
    expect(login.headers.get("location")).toBe("/posts/new?product=abo-b07pdyw6vm");

    const handle = `nx${Date.now()}${Math.floor(Math.random() * 1000)}`;
    const reg = await fetch(new URL("/register", baseUrl()), {
      method: "POST",
      redirect: "manual",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ email: `${handle}@example.com`, handle, displayName: "Next test", password: "password123", next: "/posts/new?compare=abo-b07pdyw6vm" }),
    });
    expect(reg.headers.get("location")).toBe("/posts/new?compare=abo-b07pdyw6vm");
  });

  it("the login form carries next through, and the register link keeps it", async () => {
    const html = await (await fetch(new URL("/login?next=%2Fposts%2Fnew%3Fproduct%3Dabo-b07pdyw6vm", baseUrl()))).text();
    expect(html).toContain('name="next" value="/posts/new?product=abo-b07pdyw6vm"');
    expect(html).toContain('href="/register?next=%2Fposts%2Fnew%3Fproduct%3Dabo-b07pdyw6vm"');
  });

  it("never redirects off-site, whatever next says", async () => {
    const user = await registerUser();
    for (const next of ["https://evil.example/", "//evil.example/x", "/\\evil.example", "javascript:alert(1)", " /discover"]) {
      const res = await fetch(new URL("/login", baseUrl()), {
        method: "POST",
        redirect: "manual",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({ email: user.email, password: "password123", next }),
      });
      expect(res.headers.get("location"), next).toBe("/discover");
    }
  });
});

describe("opinion validation, reached by an eligible non-owner", () => {
  it("rejects a malformed stance and an over-long comment with 400, and stores nothing", async () => {
    const alice = await registerUser();
    const bob = await registerUser();
    const postId = await createPost(alice);
    const badStance = await apiCall(bob, `/posts/${postId}/opinions`, form(bob, { stance: "MAYBE", comment: "valid comment" }));
    expect(badStance.status).toBe(400);
    expect((await badStance.json()).errors.join(" ")).toMatch(/stance/i);
    const longComment = await apiCall(bob, `/posts/${postId}/opinions`, form(bob, { stance: "BUY", comment: "x".repeat(501) }));
    expect(longComment.status).toBe(400);
    expect((await longComment.json()).errors.join(" ")).toMatch(/comment/i);
    const html = await (await fetch(new URL(`/posts/${postId}`, baseUrl()))).text();
    expect(html).toContain("👍 0 Buy");
    expect(html).toContain("👎 0 Pass");
  });

  it("still rejects the post's own author with 403, before validation", async () => {
    const alice = await registerUser();
    const postId = await createPost(alice);
    const res = await apiCall(alice, `/posts/${postId}/opinions`, form(alice, { stance: "MAYBE", comment: "x" }));
    expect(res.status).toBe(403);
  });
});
