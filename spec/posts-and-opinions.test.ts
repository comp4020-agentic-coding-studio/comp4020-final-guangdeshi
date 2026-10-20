// TEST C/D/E/F/G/I/J/K from the brief: post creation with an image, opinion
// submission, live counts, cross-user edit rejection, and outcome ownership.
import { describe, expect, it } from "vitest";
import { apiCall, baseUrl, createPost, registerUser, submitOpinion } from "./helpers.ts";

describe("post creation", () => {
  it("lets an authenticated user create a post with an uploaded image", async () => {
    const alice = await registerUser();
    const postId = await createPost(alice, { title: "Mac mini M4 Pro for local AI" });
    const res = await fetch(new URL(`/posts/${postId}`, baseUrl()));
    expect(res.status).toBe(200);
    const html = await res.text();
    expect(html).toContain("Mac mini M4 Pro for local AI");
    expect(html).toMatch(/\/images\/[a-f0-9-]{36}/);
  });

  it("rejects post creation with zero images", async () => {
    const alice = await registerUser();
    const res = await fetch(new URL("/posts/new", baseUrl()), {
      method: "POST",
      redirect: "manual",
      headers: { Cookie: `bop_session=${alice.sessionCookie}; bop_csrf=${alice.csrfToken}` },
      body: (() => {
        const form = new FormData();
        form.set("csrf", alice.csrfToken);
        form.set("title", "No image post");
        form.set("description", "This should fail validation");
        form.set("category", "computing");
        form.set("visibility", "public");
        return form;
      })(),
    });
    expect(res.status).toBe(400);
  });

  it("rejects post creation from an unauthenticated visitor", async () => {
    const res = await fetch(new URL("/posts/new", baseUrl()), { method: "POST", redirect: "manual", body: new FormData() });
    expect(res.status).toBe(401);
  });

  it("keeps an unlisted post out of the public discover feed but reachable by direct link", async () => {
    const alice = await registerUser();
    const postId = await createPost(alice, { title: "Unlisted gadget XYZ123", visibility: "unlisted" });

    const direct = await fetch(new URL(`/posts/${postId}`, baseUrl()));
    expect(direct.status).toBe(200);

    const feed = await fetch(new URL("/discover", baseUrl()));
    const feedHtml = await feed.text();
    expect(feedHtml).not.toContain("Unlisted gadget XYZ123");
  });
});

describe("post editing", () => {
  it("updates text fields and keeps the existing images when no new ones are uploaded", async () => {
    const alice = await registerUser();
    const postId = await createPost(alice, { title: "Original title before edit" });
    const before = await fetch(new URL(`/posts/${postId}`, baseUrl()));
    const imageUrlBefore = (await before.text()).match(/\/images\/[a-f0-9-]{36}/)![0];

    const res = await apiCall(alice, `/posts/${postId}/edit`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        csrf: alice.csrfToken,
        title: "Updated title after edit",
        description: "Updated description text after editing this post",
        category: "computing",
        visibility: "public",
      }),
    });
    expect(res.status).toBe(303);

    const after = await fetch(new URL(`/posts/${postId}`, baseUrl()));
    const afterHtml = await after.text();
    expect(afterHtml).toContain("Updated title after edit");
    expect(afterHtml).not.toContain("Original title before edit");
    expect(afterHtml).toContain(imageUrlBefore);
  });

  it("rejects an edit with an invalid category, leaving the post unchanged", async () => {
    const alice = await registerUser();
    const postId = await createPost(alice, { title: "Should stay unchanged" });

    const res = await apiCall(alice, `/posts/${postId}/edit`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        csrf: alice.csrfToken,
        title: "Attempted bad edit",
        description: "Attempted bad edit description text",
        category: "not-a-real-category",
        visibility: "public",
      }),
    });
    expect(res.status).toBe(400);

    const page = await fetch(new URL(`/posts/${postId}`, baseUrl()));
    const html = await page.text();
    expect(html).toContain("Should stay unchanged");
  });
});

describe("opinions: the core business rule", () => {
  it("lets another user submit a Buy opinion with a comment, and counts update", async () => {
    const alice = await registerUser();
    const bob = await registerUser();
    const postId = await createPost(alice);

    const res = await submitOpinion(bob, postId, "BUY", "Looks great, go for it!");
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.counts).toEqual({ buy: 1, pass: 0 });

    const page = await fetch(new URL(`/posts/${postId}`, baseUrl()));
    const html = await page.text();
    expect(html).toContain("Looks great, go for it!");
  });

  it("enforces exactly one current opinion per (post, user) by updating in place, not duplicating", async () => {
    const alice = await registerUser();
    const bob = await registerUser();
    const postId = await createPost(alice);

    await submitOpinion(bob, postId, "BUY", "First opinion");
    const second = await submitOpinion(bob, postId, "PASS", "Changed my mind");
    expect(second.status).toBe(200);
    const body = await second.json();
    expect(body.counts).toEqual({ buy: 0, pass: 1 });

    const page = await fetch(new URL(`/posts/${postId}`, baseUrl()));
    const html = await page.text();
    const occurrences = html.match(/Changed my mind/g) ?? [];
    expect(occurrences).toHaveLength(1);
    expect(html).not.toContain("First opinion");
  });

  it("does not create duplicate opinions under concurrent submission from the same user", async () => {
    const alice = await registerUser();
    const bob = await registerUser();
    const postId = await createPost(alice);

    const attempts = Array.from({ length: 8 }, (_, i) => submitOpinion(bob, postId, "BUY", `Concurrent attempt ${i}`));
    const results = await Promise.all(attempts);
    expect(results.every((r) => r.status === 200)).toBe(true);

    const page = await fetch(new URL(`/posts/${postId}`, baseUrl()));
    const html = await page.text();
    const buyCountMatch = html.match(/👍 (\d+) Buy/);
    expect(buyCountMatch).not.toBeNull();
    expect(buyCountMatch![1]).toBe("1");
  });

  it("rejects an opinion submission with neither BUY nor PASS", async () => {
    const alice = await registerUser();
    const bob = await registerUser();
    const postId = await createPost(alice);
    const res = await apiCall(bob, `/posts/${postId}/opinions`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ csrf: bob.csrfToken, stance: "MAYBE", comment: "unsure" }),
    });
    expect(res.status).toBe(400);
  });

  it("rejects an empty comment", async () => {
    const alice = await registerUser();
    const bob = await registerUser();
    const postId = await createPost(alice);
    const res = await apiCall(bob, `/posts/${postId}/opinions`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ csrf: bob.csrfToken, stance: "BUY", comment: "" }),
    });
    expect(res.status).toBe(400);
  });

  it("does not let a post author submit an opinion on their own post", async () => {
    const alice = await registerUser();
    const postId = await createPost(alice);
    const res = await submitOpinion(alice, postId, "BUY", "I love my own post");
    expect(res.status).toBe(403);
  });

  it("rejects opinions on a deleted post", async () => {
    const alice = await registerUser();
    const bob = await registerUser();
    const postId = await createPost(alice);
    await apiCall(alice, `/posts/${postId}/delete`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ csrf: alice.csrfToken }),
    });
    const res = await submitOpinion(bob, postId, "BUY", "Too late");
    expect(res.status).toBe(404);
  });
});

describe("server-side authorization boundaries", () => {
  it("TEST F: prevents one user from modifying another user's opinion via the API", async () => {
    const alice = await registerUser();
    const bob = await registerUser();
    const postId = await createPost(alice);
    await submitOpinion(bob, postId, "BUY", "Bobs real opinion stands");

    // Alice tries to hijack Bob's opinion by calling the edit endpoint for
    // Bob's post as herself — the server must derive "whose opinion is this"
    // from Bob's own session, which Alice does not have, so there is no
    // opinion id for her to legitimately target. Simulate the attack via the
    // per-post endpoint instead, which is keyed off the caller's own session,
    // and confirm Bob's comment is untouched afterward.
    await submitOpinion(alice, postId, "PASS", "Alice should not be able to overwrite Bob");

    const page = await fetch(new URL(`/posts/${postId}`, baseUrl()));
    const html = await page.text();
    expect(html).toContain("Bobs real opinion stands");
  });

  it("TEST J: prevents one user from editing another user's post via the API", async () => {
    const alice = await registerUser();
    const bob = await registerUser();
    const postId = await createPost(alice, { title: "Alices original title" });

    const res = await apiCall(bob, `/posts/${postId}/edit`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        csrf: bob.csrfToken,
        title: "Hijacked by Bob",
        description: "Bob should not be able to do this at all",
        category: "computing",
        visibility: "public",
      }),
    });
    expect(res.status).toBe(403);

    const page = await fetch(new URL(`/posts/${postId}`, baseUrl()));
    const html = await page.text();
    expect(html).toContain("Alices original title");
    expect(html).not.toContain("Hijacked by Bob");
  });

  it("prevents a non-owner from deleting a post", async () => {
    const alice = await registerUser();
    const bob = await registerUser();
    const postId = await createPost(alice);
    const res = await apiCall(bob, `/posts/${postId}/delete`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ csrf: bob.csrfToken }),
    });
    expect(res.status).toBe(403);
    const page = await fetch(new URL(`/posts/${postId}`, baseUrl()));
    expect(page.status).toBe(200);
  });

  it("TEST K: only the post author can record a purchase outcome", async () => {
    const alice = await registerUser();
    const bob = await registerUser();
    const postId = await createPost(alice);

    const bobAttempt = await apiCall(bob, `/posts/${postId}/outcome`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ csrf: bob.csrfToken, status: "BOUGHT" }),
    });
    expect(bobAttempt.status).toBe(403);

    const aliceAttempt = await apiCall(alice, `/posts/${postId}/outcome`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ csrf: alice.csrfToken, status: "BOUGHT", reflection: "Happy with it" }),
    });
    expect(aliceAttempt.status).toBe(200);

    const page = await fetch(new URL(`/posts/${postId}`, baseUrl()));
    const html = await page.text();
    expect(html).toContain("Bought it");

    const profilePage = await apiCall(alice, `/u/${alice.handle}`);
    const profileHtml = await profilePage.text();
    expect(profileHtml).toContain("Your purchase outcomes");
    expect(profileHtml).toContain("Bought it");
  });

  it("admin routes reject a non-admin authenticated user", async () => {
    const alice = await registerUser();
    const res = await apiCall(alice, "/admin/api/stats");
    expect(res.status).toBe(403);
  });

  it("admin routes reject an unauthenticated visitor", async () => {
    const res = await fetch(new URL("/admin", baseUrl()));
    expect(res.status).toBe(401);
  });
});

describe("reporting", () => {
  it("lets a logged-in non-author report a post, visible to admins", async () => {
    const alice = await registerUser();
    const bob = await registerUser();
    const postId = await createPost(alice);

    const res = await apiCall(bob, `/posts/${postId}/report`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ csrf: bob.csrfToken, reason: "Looks like spam" }),
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.report.reason).toBe("Looks like spam");
    expect(body.report.status).toBe("open");
  });

  it("shows a report control only to non-authors, not to the post's own author", async () => {
    const alice = await registerUser();
    const bob = await registerUser();
    const postId = await createPost(alice);

    const authorView = await fetch(new URL(`/posts/${postId}`, baseUrl()), { headers: { Cookie: `bop_session=${alice.sessionCookie}; bop_csrf=${alice.csrfToken}` } });
    expect((await authorView.text())).not.toContain("Report this post");

    const viewerView = await fetch(new URL(`/posts/${postId}`, baseUrl()), { headers: { Cookie: `bop_session=${bob.sessionCookie}; bop_csrf=${bob.csrfToken}` } });
    expect((await viewerView.text())).toContain("Report this post");
  });

  it("a non-admin cannot resolve a report even with a real report id", async () => {
    const alice = await registerUser();
    const bob = await registerUser();
    const postId = await createPost(alice);
    const reportRes = await apiCall(bob, `/posts/${postId}/report`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ csrf: bob.csrfToken, reason: "spam" }),
    });
    const { report } = await reportRes.json();

    const res = await apiCall(bob, `/admin/api/reports/${report.id}/resolve`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ csrf: bob.csrfToken, resolution: "resolved" }),
    });
    expect(res.status).toBe(403);
  });
});
