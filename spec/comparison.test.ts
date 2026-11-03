// Feature B: Which One? comparison mode. Covers the brief's lettered
// server-side rules — 2-4 option creation/rejection, exactly-one-selection,
// "None of these", changing a vote, concurrent-safety (the same
// Promise.all pattern already used for Buy/Pass in
// posts-and-opinions.test.ts), and cross-post option-id rejection — plus
// the invariant that a comparison post's opinions never leak into a
// BUY_PASS stance count or vice versa.
import { describe, expect, it } from "vitest";
import {
  apiCall,
  baseUrl,
  createComparisonPost,
  createPost,
  getOptionIds,
  registerUser,
  submitComparisonOpinion,
  submitOpinion,
} from "./helpers.ts";

describe("comparison post creation", () => {
  it("creates a WHICH_ONE post with 2 options and renders both", async () => {
    const alice = await registerUser();
    const postId = await createComparisonPost(alice, [
      { name: "Option A", priceCents: 10000 },
      { name: "Option B", priceCents: 20000 },
    ]);
    const res = await fetch(new URL(`/posts/${postId}`, baseUrl()));
    expect(res.status).toBe(200);
    const html = await res.text();
    expect(html).toContain("Option A");
    expect(html).toContain("Option B");
    expect(html).toContain("comparison-grid");
  });

  it("creates a WHICH_ONE post with the maximum of 4 options", async () => {
    const alice = await registerUser();
    const postId = await createComparisonPost(alice, [
      { name: "Opt 1", priceCents: 1000 },
      { name: "Opt 2", priceCents: 2000 },
      { name: "Opt 3", priceCents: 3000 },
      { name: "Opt 4", priceCents: 4000 },
    ]);
    const ids = await getOptionIds(postId);
    expect(ids).toHaveLength(4);
  });

  it("rejects a comparison post with only 1 option", async () => {
    const alice = await registerUser();
    await expect(createComparisonPost(alice, [{ name: "Only one", priceCents: 1000 }])).rejects.toThrow();
  });

  it("rejects a comparison post with 5 options", async () => {
    const alice = await registerUser();
    await expect(
      createComparisonPost(alice, [
        { name: "A", priceCents: 1000 },
        { name: "B", priceCents: 1000 },
        { name: "C", priceCents: 1000 },
        { name: "D", priceCents: 1000 },
        { name: "E", priceCents: 1000 },
      ]),
    ).rejects.toThrow();
  });

  it("defaults every pre-existing post to BUY_PASS mode (backward compatibility)", async () => {
    const alice = await registerUser();
    const postId = await createPost(alice, { title: "A plain Buy/Pass post" });
    const res = await fetch(new URL(`/posts/${postId}`, baseUrl()));
    const html = await res.text();
    expect(html).toContain('data-post-mode="BUY_PASS"');
  });
});

describe("comparison opinions: selection rules", () => {
  it("lets a reviewer pick exactly one option plus a comment", async () => {
    const alice = await registerUser();
    const bob = await registerUser();
    const postId = await createComparisonPost(alice, [
      { name: "Choice One", priceCents: 10000 },
      { name: "Choice Two", priceCents: 20000 },
    ]);
    const [optionId] = await getOptionIds(postId);

    const res = await submitComparisonOpinion(bob, postId, { optionId }, "Choice One is better value.");
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.opinion.selectedOptionId).toBe(optionId);
    expect(body.opinion.selectedNone).toBe(false);
    expect(body.opinion.stance).toBeNull();

    const page = await fetch(new URL(`/posts/${postId}`, baseUrl()));
    const html = await page.text();
    expect(html).toContain("Choice One is better value.");
  });

  it("lets a reviewer pick 'None of these'", async () => {
    const alice = await registerUser();
    const bob = await registerUser();
    const postId = await createComparisonPost(alice, [
      { name: "Choice One", priceCents: 10000 },
      { name: "Choice Two", priceCents: 20000 },
    ]);

    const res = await submitComparisonOpinion(bob, postId, { none: true }, "Neither works for my budget.");
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.opinion.selectedNone).toBe(true);
    expect(body.opinion.selectedOptionId).toBeNull();

    const page = await fetch(new URL(`/posts/${postId}`, baseUrl()));
    const html = await page.text();
    expect(html).toContain("said none of these");
  });

  it("lets a reviewer change their selection, updating in place rather than duplicating", async () => {
    const alice = await registerUser();
    const bob = await registerUser();
    const postId = await createComparisonPost(alice, [
      { name: "Choice One", priceCents: 10000 },
      { name: "Choice Two", priceCents: 20000 },
    ]);
    const [firstId, secondId] = await getOptionIds(postId);

    await submitComparisonOpinion(bob, postId, { optionId: firstId }, "Initially picked the first one.");
    const second = await submitComparisonOpinion(bob, postId, { optionId: secondId }, "Changed my mind.");
    expect(second.status).toBe(200);

    const page = await fetch(new URL(`/posts/${postId}`, baseUrl()));
    const html = await page.text();
    expect(html).toContain("Changed my mind.");
    expect(html).not.toContain("Initially picked the first one.");
    const occurrences = html.match(/Changed my mind\./g) ?? [];
    expect(occurrences).toHaveLength(1);
  });

  it("does not create duplicate opinions under concurrent comparison submissions from the same user", async () => {
    const alice = await registerUser();
    const bob = await registerUser();
    const postId = await createComparisonPost(alice, [
      { name: "Choice One", priceCents: 10000 },
      { name: "Choice Two", priceCents: 20000 },
    ]);
    const [optionId] = await getOptionIds(postId);

    const attempts = Array.from({ length: 8 }, (_, i) => submitComparisonOpinion(bob, postId, { optionId }, `Concurrent attempt ${i}`));
    const results = await Promise.all(attempts);
    expect(results.every((r) => r.status === 200)).toBe(true);

    const page = await fetch(new URL(`/posts/${postId}`, baseUrl()));
    const html = await page.text();
    const voteCountMatch = html.match(/(\d+) opinions?/);
    expect(voteCountMatch).not.toBeNull();
    expect(voteCountMatch![1]).toBe("1");
  });

  it("rejects selecting an option id that belongs to a different post", async () => {
    const alice = await registerUser();
    const bob = await registerUser();
    const postA = await createComparisonPost(alice, [
      { name: "A1", priceCents: 1000 },
      { name: "A2", priceCents: 2000 },
    ]);
    const postB = await createComparisonPost(alice, [
      { name: "B1", priceCents: 1000 },
      { name: "B2", priceCents: 2000 },
    ]);
    const [, foreignOptionId] = await getOptionIds(postB);

    const res = await submitComparisonOpinion(bob, postA, { optionId: foreignOptionId }, "Trying to use another post's option");
    expect(res.status).toBe(400);
  });

  it("rejects a fabricated/non-existent option id", async () => {
    const alice = await registerUser();
    const bob = await registerUser();
    const postId = await createComparisonPost(alice, [
      { name: "A", priceCents: 1000 },
      { name: "B", priceCents: 2000 },
    ]);
    const res = await submitComparisonOpinion(bob, postId, { optionId: "00000000-0000-0000-0000-000000000000" }, "fabricated id");
    expect(res.status).toBe(400);
  });

  it("rejects a BUY/PASS-shaped submission on a comparison post", async () => {
    const alice = await registerUser();
    const bob = await registerUser();
    const postId = await createComparisonPost(alice, [
      { name: "A", priceCents: 1000 },
      { name: "B", priceCents: 2000 },
    ]);
    const res = await submitOpinion(bob, postId, "BUY", "this should be rejected");
    expect(res.status).toBe(400);
  });

  it("rejects a comparison-shaped submission on a BUY_PASS post", async () => {
    const alice = await registerUser();
    const bob = await registerUser();
    const postId = await createPost(alice, { title: "Plain single-product post" });
    const res = await submitComparisonOpinion(bob, postId, { none: true }, "this should be rejected");
    expect(res.status).toBe(400);
  });

  it("does not let a post author submit a comparison opinion on their own post", async () => {
    const alice = await registerUser();
    const postId = await createComparisonPost(alice, [
      { name: "A", priceCents: 1000 },
      { name: "B", priceCents: 2000 },
    ]);
    const [optionId] = await getOptionIds(postId);
    const res = await submitComparisonOpinion(alice, postId, { optionId }, "voting on my own post");
    expect(res.status).toBe(403);
  });

  it("never lets a comparison selection inflate a BUY/PASS-style count", async () => {
    const alice = await registerUser();
    const bob = await registerUser();
    const postId = await createComparisonPost(alice, [
      { name: "A", priceCents: 1000 },
      { name: "B", priceCents: 2000 },
    ]);
    const [optionId] = await getOptionIds(postId);
    await submitComparisonOpinion(bob, postId, { optionId }, "picking A");

    const page = await fetch(new URL(`/posts/${postId}`, baseUrl()));
    const html = await page.text();
    expect(html).not.toMatch(/👍 \d+ Buy/);
    expect(html).not.toMatch(/👎 \d+ Pass/);
  });
});

describe("comparison outcome", () => {
  it("lets the author record which option they actually bought", async () => {
    const alice = await registerUser();
    const postId = await createComparisonPost(alice, [
      { name: "A", priceCents: 1000 },
      { name: "B", priceCents: 2000 },
    ]);
    const [, secondId] = await getOptionIds(postId);

    const res = await apiCall(alice, `/posts/${postId}/outcome`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ csrf: alice.csrfToken, status: "BOUGHT", purchasedOptionId: secondId }),
    });
    expect(res.status).toBe(200);

    const page = await fetch(new URL(`/posts/${postId}`, baseUrl()));
    const html = await page.text();
    expect(html).toContain("Bought: B");
  });
});
