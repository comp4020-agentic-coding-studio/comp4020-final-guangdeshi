// Feature E: Influenced My Decision. Covers the brief's explicit rules —
// owner-only marking, the marked opinion must belong to the same post,
// marking never changes vote counts, marking is optional and independent of
// recording a purchase outcome, and a deleted opinion must not leave a
// broken reference (the ON DELETE SET NULL schema decision in
// src/migrations.ts's 0006_outcome_extensions).
import { describe, expect, it } from "vitest";
import { apiCall, baseUrl, cookieHeader, createPost, registerUser, submitOpinion, type Session } from "./helpers.ts";

// The influential-mark-form (which carries the opinion id in its action URL)
// only renders to the post's own author — src/pages.ts's postDetailPage only
// emits markControl when isAuthor is true — so this must view the page as
// the post owner, not anonymously.
async function getOpinionId(owner: Session, postId: string, opinionAuthorHandle: string): Promise<string> {
  const res = await fetch(new URL(`/posts/${postId}`, baseUrl()), { headers: { Cookie: cookieHeader(owner) } });
  const html = await res.text();
  const regex = new RegExp(`@${opinionAuthorHandle}[\\s\\S]*?/opinions/([a-f0-9-]{36})/influential`);
  const match = html.match(regex);
  if (!match) throw new Error(`could not find opinion id for ${opinionAuthorHandle} on post ${postId}`);
  return match[1];
}

describe("influential opinion marking", () => {
  it("lets the post author mark an opinion on their own post as influential", async () => {
    const alice = await registerUser();
    const bob = await registerUser();
    const postId = await createPost(alice);
    await submitOpinion(bob, postId, "BUY", "Go for it, great choice.");
    const opinionId = await getOpinionId(alice, postId, bob.handle);

    const res = await apiCall(alice, `/posts/${postId}/opinions/${opinionId}/influential`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ csrf: alice.csrfToken, action: "mark" }),
    });
    expect(res.status).toBe(200);

    const page = await fetch(new URL(`/posts/${postId}`, baseUrl()));
    const html = await page.text();
    expect(html).toContain("Influenced the decision");
  });

  it("lets the author unmark a previously-marked opinion", async () => {
    const alice = await registerUser();
    const bob = await registerUser();
    const postId = await createPost(alice);
    await submitOpinion(bob, postId, "BUY", "Marking then unmarking.");
    const opinionId = await getOpinionId(alice, postId, bob.handle);

    await apiCall(alice, `/posts/${postId}/opinions/${opinionId}/influential`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ csrf: alice.csrfToken, action: "mark" }),
    });
    const res = await apiCall(alice, `/posts/${postId}/opinions/${opinionId}/influential`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ csrf: alice.csrfToken, action: "unmark" }),
    });
    expect(res.status).toBe(200);

    const page = await fetch(new URL(`/posts/${postId}`, baseUrl()));
    const html = await page.text();
    expect(html).not.toContain("Influenced the decision");
  });

  it("does not let a non-author mark an opinion as influential", async () => {
    const alice = await registerUser();
    const bob = await registerUser();
    const carol = await registerUser();
    const postId = await createPost(alice);
    await submitOpinion(bob, postId, "BUY", "An opinion to try hijacking.");
    const opinionId = await getOpinionId(alice, postId, bob.handle);

    const res = await apiCall(carol, `/posts/${postId}/opinions/${opinionId}/influential`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ csrf: carol.csrfToken, action: "mark" }),
    });
    expect(res.status).toBe(403);
  });

  it("rejects marking an opinion that belongs to a different post", async () => {
    const alice = await registerUser();
    const bob = await registerUser();
    const postA = await createPost(alice, { title: "Post A" });
    const postB = await createPost(alice, { title: "Post B" });
    await submitOpinion(bob, postB, "BUY", "An opinion on post B.");
    const foreignOpinionId = await getOpinionId(alice, postB, bob.handle);

    const res = await apiCall(alice, `/posts/${postA}/opinions/${foreignOpinionId}/influential`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ csrf: alice.csrfToken, action: "mark" }),
    });
    expect(res.status).toBe(400);
  });

  it("marking an opinion as influential never changes Buy/Pass vote counts", async () => {
    const alice = await registerUser();
    const bob = await registerUser();
    const postId = await createPost(alice);
    await submitOpinion(bob, postId, "BUY", "Counted once, marking should not double it.");
    const opinionId = await getOpinionId(alice, postId, bob.handle);

    const before = await fetch(new URL(`/posts/${postId}`, baseUrl()));
    const beforeHtml = await before.text();
    const beforeCount = beforeHtml.match(/👍 (\d+) Buy/)![1];

    await apiCall(alice, `/posts/${postId}/opinions/${opinionId}/influential`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ csrf: alice.csrfToken, action: "mark" }),
    });

    const after = await fetch(new URL(`/posts/${postId}`, baseUrl()));
    const afterHtml = await after.text();
    const afterCount = afterHtml.match(/👍 (\d+) Buy/)![1];
    expect(afterCount).toBe(beforeCount);
  });

  it("can mark an opinion as influential before any purchase outcome is recorded", async () => {
    const alice = await registerUser();
    const bob = await registerUser();
    const postId = await createPost(alice);
    await submitOpinion(bob, postId, "BUY", "Marking before any outcome exists.");
    const opinionId = await getOpinionId(alice, postId, bob.handle);

    const res = await apiCall(alice, `/posts/${postId}/opinions/${opinionId}/influential`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ csrf: alice.csrfToken, action: "mark" }),
    });
    expect(res.status).toBe(200);

    const page = await fetch(new URL(`/posts/${postId}`, baseUrl()));
    const html = await page.text();
    expect(html).toContain("Influenced the decision");
    // No outcome was ever recorded — only the influential marker exists.
    expect(html).not.toContain("Bought it");
    expect(html).not.toContain("Didn't buy");
  });

  it("does not leave a broken reference when the marked opinion is later deleted", async () => {
    const alice = await registerUser();
    const bob = await registerUser();
    const postId = await createPost(alice);
    await submitOpinion(bob, postId, "BUY", "This opinion will be deleted after being marked influential.");
    const opinionId = await getOpinionId(alice, postId, bob.handle);

    await apiCall(alice, `/posts/${postId}/opinions/${opinionId}/influential`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ csrf: alice.csrfToken, action: "mark" }),
    });

    const deleteRes = await apiCall(bob, `/opinions/${opinionId}/delete`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ csrf: bob.csrfToken }),
    });
    expect(deleteRes.status).toBe(200);

    // The post itself must still load cleanly (no FK violation / 500), with
    // no influential badge left dangling since the opinion no longer exists.
    const page = await fetch(new URL(`/posts/${postId}`, baseUrl()));
    expect(page.status).toBe(200);
    const html = await page.text();
    expect(html).not.toContain("Influenced the decision");
    expect(html).not.toContain("This opinion will be deleted after being marked influential.");
  });
});
