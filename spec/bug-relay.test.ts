import { beforeEach, describe, expect, it } from "vitest";
import { inject } from "vitest";

// HTTP-level tests against the RUNNING app (spec/global-setup.ts finds it),
// same pattern as the shipped invariants.test.ts. Each test uses its own
// in-memory "session" (a captured Set-Cookie) to act as an independent
// participant — this is what makes "two distinct browser sessions" testable
// without an actual browser.
const baseUrl = inject("baseUrl");
const CASE_ID = "checkout-failure";

function url(path: string): URL {
  return new URL(path, baseUrl);
}

class Session {
  private cookie: string | null = null;

  async fetch(path: string, init: RequestInit = {}): Promise<Response> {
    const headers = new Headers(init.headers);
    if (this.cookie) headers.set("Cookie", this.cookie);
    const res = await fetch(url(path), { ...init, headers, redirect: "manual" });
    const setCookie = res.headers.get("set-cookie");
    if (setCookie) this.cookie = setCookie.split(";")[0];
    return res;
  }

  async join(displayName: string): Promise<void> {
    // a GET first, the way a real browser visits the room before any POST,
    // so the session cookie is minted the same way it is for a real visitor
    await this.fetch(`/cases/${CASE_ID}`);
    const res = await this.fetch("/api/me", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ displayName }),
    });
    expect(res.status).toBe(200);
  }

  async submit(params: Record<string, string>, note?: string): Promise<Response> {
    return this.fetch(`/api/cases/${CASE_ID}/experiments`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ params, note: note ?? null }),
    });
  }

  async state(): Promise<any> {
    const res = await this.fetch(`/api/cases/${CASE_ID}/state`);
    expect(res.status).toBe(200);
    return res.json();
  }

  get sessionCookie(): string | null {
    return this.cookie;
  }
}

async function reset(): Promise<void> {
  const res = await fetch(url(`/api/cases/${CASE_ID}/reset`), { method: "POST" });
  expect(res.status).toBe(200);
}

beforeEach(async () => {
  await reset();
});

describe("rooms and landing", () => {
  it("serves the landing page with a link into the checkout-failure room", async () => {
    const res = await fetch(url("/"));
    expect(res.status).toBe(200);
    const html = await res.text();
    expect(html).toContain("/cases/checkout-failure");
  });

  it("serves the investigation room for a known case", async () => {
    const res = await fetch(url(`/cases/${CASE_ID}`));
    expect(res.status).toBe(200);
  });

  it("404s a room for an unknown case id", async () => {
    const res = await fetch(url("/cases/does-not-exist"));
    expect(res.status).toBe(404);
  });
});

describe("participants", () => {
  it("gives two independent sessions distinct participant ids", async () => {
    const alice = new Session();
    const bob = new Session();
    await alice.join("Alice");
    await bob.join("Bob");
    expect(alice.sessionCookie).not.toBeNull();
    expect(bob.sessionCookie).not.toBeNull();
    expect(alice.sessionCookie).not.toBe(bob.sessionCookie);
  });

  it("rejects an experiment submission before a display name is set", async () => {
    const anon = new Session();
    await anon.fetch(`/cases/${CASE_ID}`);
    const res = await anon.submit({ shipping: "standard", payment: "card", promo: "none" });
    expect(res.status).toBe(400);
  });

  it("rejects an invalid parameter combination", async () => {
    const session = new Session();
    await session.join("Carol");
    const res = await session.submit({ shipping: "diagonal", payment: "card", promo: "none" });
    expect(res.status).toBe(400);
  });
});

describe("evidence persistence and attribution", () => {
  it("records who submitted an experiment and it survives a reload", async () => {
    const alice = new Session();
    await alice.join("Alice");
    const submitRes = await alice.submit({ shipping: "express", payment: "card", promo: "applied" });
    expect(submitRes.status).toBe(200);
    const body = await submitRes.json();
    expect(body.experiment.passed).toBe(false);
    expect(body.experiment.expectedResult).toBe("accepted");
    expect(body.experiment.actualResult).toBe("rejected");

    // "reload" = a fresh GET of the authoritative state, same as the shipped
    // invariant pattern treats a reload as a fresh GET /.
    const state = await alice.state();
    expect(state.experiments).toHaveLength(1);
    expect(state.experiments[0].participantName).toBe("Alice");
    expect(state.experiments[0].passed).toBe(false);
  });

  it("updates the next-test recommendation as evidence accumulates", async () => {
    const alice = new Session();
    await alice.join("Alice");
    const before = await alice.state();
    expect(before.recommendation.status).toBe("insufficient");

    await alice.submit({ shipping: "express", payment: "card", promo: "applied" });
    const after = await alice.state();
    expect(after.recommendation.consistentHypothesisIds.length).toBeLessThan(
      before.recommendation.consistentHypothesisIds.length,
    );
  });
});

describe("concurrent and duplicate submissions", () => {
  it("retains two simultaneous submissions of different combinations", async () => {
    const alice = new Session();
    const bob = new Session();
    await alice.join("Alice");
    await bob.join("Bob");

    const [aRes, bRes] = await Promise.all([
      alice.submit({ shipping: "standard", payment: "card", promo: "none" }),
      bob.submit({ shipping: "express", payment: "paypal", promo: "applied" }),
    ]);
    expect(aRes.status).toBe(200);
    expect(bRes.status).toBe(200);

    const state = await alice.state();
    expect(state.experiments).toHaveLength(2);
  });

  it("retains an exact duplicate submission as a second row rather than discarding it", async () => {
    const alice = new Session();
    await alice.join("Alice");
    const params = { shipping: "standard", payment: "card", promo: "none" };
    await alice.submit(params);
    await alice.submit(params);
    const state = await alice.state();
    expect(state.experiments).toHaveLength(2);
    expect(state.experiments[0].id).not.toBe(state.experiments[1].id);
  });
});

describe("reveal", () => {
  it("refuses to reveal the cause before the evidence narrows to one hypothesis", async () => {
    const alice = new Session();
    const res = await alice.fetch(`/api/cases/${CASE_ID}/reveal`);
    expect(res.status).toBe(409);
  });

  it("reveals the known cause once evidence narrows to exactly one hypothesis", async () => {
    const alice = new Session();
    await alice.join("Alice");
    // the discriminating sequence that collapses the hypothesis set to
    // express-plus-promo (mirrors spec/recommend.test.ts's unit-level check)
    await alice.submit({ shipping: "standard", payment: "card", promo: "none" });
    await alice.submit({ shipping: "express", payment: "paypal", promo: "applied" });
    await alice.submit({ shipping: "standard", payment: "paypal", promo: "applied" });
    await alice.submit({ shipping: "express", payment: "paypal", promo: "none" });

    const state = await alice.state();
    expect(state.recommendation.status).toBe("identified");

    const reveal = await alice.fetch(`/api/cases/${CASE_ID}/reveal`);
    expect(reveal.status).toBe(200);
    const body = await reveal.json();
    expect(body.explanation).toContain("express");
  });
});

describe("reset", () => {
  it("clears all experiments for the case and broadcasts the cleared state", async () => {
    const alice = new Session();
    await alice.join("Alice");
    await alice.submit({ shipping: "standard", payment: "card", promo: "none" });
    expect((await alice.state()).experiments).toHaveLength(1);

    const resetRes = await alice.fetch(`/api/cases/${CASE_ID}/reset`, { method: "POST" });
    expect(resetRes.status).toBe(200);
    const body = await resetRes.json();
    expect(body.state.experiments).toHaveLength(0);
    expect((await alice.state()).experiments).toHaveLength(0);
  });
});

describe("realtime broadcasting", () => {
  it("delivers a new experiment to an open SSE connection within the request lifecycle", async () => {
    const alice = new Session();
    await alice.join("Alice");

    const sseRes = await fetch(url(`/api/cases/${CASE_ID}/events`));
    expect(sseRes.status).toBe(200);
    expect(sseRes.headers.get("content-type")).toContain("text/event-stream");
    const reader = sseRes.body!.getReader();
    const decoder = new TextDecoder();

    // the first frame is always the authoritative snapshot sent on connect
    const first = await reader.read();
    expect(decoder.decode(first.value)).toContain("event: state");

    await alice.submit({ shipping: "express", payment: "card", promo: "applied" });

    const second = await reader.read();
    const text = decoder.decode(second.value);
    expect(text).toContain("event: state");
    expect(text).toContain("express");

    await reader.cancel();
  });
});
