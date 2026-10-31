// Feature C: Similar Historical Decisions. Covers that the search is a
// plain, transparent FTS5 keyword match (not fabricated results), that it
// respects unlisted visibility (an unlisted post must never leak into
// another post's "related decisions" or the keyword search results), and
// that demo and real content stay separated in search just as in the feeds.
import { describe, expect, it } from "vitest";
import { apiCall, baseUrl, createPost, registerUser } from "./helpers.ts";

// searchPosts() (src/db.ts) tokenizes a title into an OR of every one of
// its words, so ANY word repeated verbatim across test runs — whether a
// common English word ("Mechanical keyboard...") or a fixed nonsense word
// ("Zigvorn plintheth...") — accumulates duplicate matching posts in a
// long-lived, never-reset database, each prior run's pair becoming a
// plausible competing match for the current run's own pair under
// searchPosts's bounded `limit: 4` window (src/server.ts's
// handlePostDetail). Found via a design-audit stability check (running the
// full suite repeatedly without resetting the database) and fixed twice
// before landing on the actually-sufficient version: appending a unique
// run id to otherwise-fixed words only reduces the collision rate (the
// *other* words are still fixed and still accumulate); using fixed
// nonsense words instead of common English words changes nothing, since
// searchPosts treats every word identically regardless of whether it's a
// real word. The only fix that is correct independent of how many times
// this suite has been run against the same database is generating the
// ENTIRE title fresh each run, so no word in it — not just one token - can
// ever repeat across runs.
function randomWord(): string {
  return Math.random().toString(36).slice(2, 2 + 6 + Math.floor(Math.random() * 4));
}
function freshTitle(wordCount: number): string {
  return Array.from({ length: wordCount }, randomWord).join(" ");
}

describe("historical decision search", () => {
  it("surfaces a public post as a related decision for another post sharing distinctive title words", async () => {
    const alice = await registerUser();
    const bob = await registerUser();
    const sharedWord = randomWord();
    const titleA = `${randomWord()} ${sharedWord} ${randomWord()}`;
    const titleB = `${randomWord()} ${sharedWord} ${randomWord()} ${randomWord()}`;
    await createPost(alice, { title: titleA });
    const postId = await createPost(bob, { title: titleB });

    const res = await fetch(new URL(`/posts/${postId}`, baseUrl()));
    const html = await res.text();
    expect(html).toContain("Related decisions");
    expect(html).toContain(titleA);
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
