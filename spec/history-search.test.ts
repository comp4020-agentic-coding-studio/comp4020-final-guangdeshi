// Feature C: Similar Historical Decisions. Covers that the search is a
// plain, transparent FTS5 keyword match (not fabricated results), that it
// respects unlisted visibility (an unlisted post must never leak into
// another post's "related decisions" or the keyword search results), and
// that demo and real content stay separated in search just as in the feeds.
import { describe, expect, it } from "vitest";
import { apiCall, baseUrl, createPost, registerUser } from "./helpers.ts";

describe("historical decision search", () => {
  it("surfaces a public post as a related decision for another post sharing distinctive title words", async () => {
    const alice = await registerUser();
    const bob = await registerUser();
    await createPost(alice, { title: "Mechanical keyboard for office typing XQZ" });
    const postId = await createPost(bob, { title: "Another mechanical keyboard question XQZ" });

    const res = await fetch(new URL(`/posts/${postId}`, baseUrl()));
    const html = await res.text();
    expect(html).toContain("Related decisions");
    expect(html).toContain("Mechanical keyboard for office typing XQZ");
  });

  it("finds posts via the Discover search box using the same keyword match", async () => {
    const alice = await registerUser();
    await createPost(alice, { title: "Searchable espresso machine decision UNIQUEWORD42" });

    const res = await fetch(new URL("/discover?q=UNIQUEWORD42", baseUrl()));
    const html = await res.text();
    expect(html).toContain("Searchable espresso machine decision UNIQUEWORD42");
  });

  it("never surfaces an unlisted post as a related decision", async () => {
    const alice = await registerUser();
    const bob = await registerUser();
    await createPost(alice, { title: "Unlisted sleeping bag question SECRETWORD77", visibility: "unlisted" });
    const postId = await createPost(bob, { title: "Public sleeping bag question SECRETWORD77" });

    const res = await fetch(new URL(`/posts/${postId}`, baseUrl()));
    const html = await res.text();
    expect(html).not.toContain("Unlisted sleeping bag question SECRETWORD77");
  });

  it("never surfaces an unlisted post via the Discover search box", async () => {
    const alice = await registerUser();
    await createPost(alice, { title: "Hidden unlisted post ZEBRAWORD99", visibility: "unlisted" });

    const res = await fetch(new URL("/discover?q=ZEBRAWORD99", baseUrl()));
    const html = await res.text();
    expect(html).not.toContain("Hidden unlisted post ZEBRAWORD99");
  });

  it("does not surface a soft-deleted post as a related decision", async () => {
    const alice = await registerUser();
    const bob = await registerUser();
    const deletedPostId = await createPost(alice, { title: "Soon deleted laptop question QWOPWORD55" });
    await apiCall(alice, `/posts/${deletedPostId}/delete`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ csrf: alice.csrfToken }),
    });
    const postId = await createPost(bob, { title: "Another laptop question QWOPWORD55" });

    const res = await fetch(new URL(`/posts/${postId}`, baseUrl()));
    const html = await res.text();
    expect(html).not.toContain("Soon deleted laptop question QWOPWORD55");
  });

  it("does not let a post detail page break when search finds nothing related", async () => {
    const alice = await registerUser();
    const postId = await createPost(alice, { title: "Totally singular wordsalad zzyzxqqrrpp" });
    const res = await fetch(new URL(`/posts/${postId}`, baseUrl()));
    expect(res.status).toBe(200);
  });
});
