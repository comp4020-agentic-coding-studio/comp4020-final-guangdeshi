// Discover feed: category browsing, search, and "most discussed" sort
// (brief's "popular or actively discussed posts" requirement).
import { describe, expect, it } from "vitest";
import { baseUrl, createPost, registerUser, submitOpinion } from "./helpers.ts";

describe("discover: most discussed sort", () => {
  it("orders posts by total opinion count, most first", async () => {
    const author = await registerUser();
    const voter1 = await registerUser();
    const voter2 = await registerUser();
    const voter3 = await registerUser();

    const quietPostId = await createPost(author, { title: "Quiet post with zero opinions XYZ" });
    const popularPostId = await createPost(author, { title: "Popular post with three opinions XYZ" });

    await submitOpinion(voter1, popularPostId, "BUY", "Opinion one");
    await submitOpinion(voter2, popularPostId, "PASS", "Opinion two");
    await submitOpinion(voter3, popularPostId, "BUY", "Opinion three");

    const res = await fetch(new URL("/discover?sort=discussed", baseUrl()));
    expect(res.status).toBe(200);
    const html = await res.text();
    const popularIndex = html.indexOf("Popular post with three opinions XYZ");
    const quietIndex = html.indexOf("Quiet post with zero opinions XYZ");
    expect(popularIndex).toBeGreaterThan(-1);
    expect(quietIndex).toBeGreaterThan(-1);
    expect(popularIndex).toBeLessThan(quietIndex);
  });

  it("excludes unlisted posts from most-discussed, same as the recent feed", async () => {
    const author = await registerUser();
    const voter = await registerUser();
    const unlistedId = await createPost(author, { title: "Unlisted discussed post XYZ", visibility: "unlisted" });
    await submitOpinion(voter, unlistedId, "BUY", "Should not surface this in discover");

    const res = await fetch(new URL("/discover?sort=discussed", baseUrl()));
    const html = await res.text();
    expect(html).not.toContain("Unlisted discussed post XYZ");
  });
});

describe("discover: pagination", () => {
  it("paginates the feed with a cursor, never repeating a post across pages", async () => {
    // The feed page size is 20 (src/server.ts handleDiscover), so 22 posts
    // in one category guarantees a second page exists.
    const author = await registerUser();
    const marker = `Pagination${Date.now()}`;
    const titles: string[] = [];
    // Zero-padded index avoids "post 1" being a string-prefix of "post 10"
    // when later checked with a plain substring `includes()`.
    for (let i = 0; i < 22; i++) {
      const title = `${marker} post ${String(i).padStart(2, "0")}`;
      titles.push(title);
      await createPost(author, { title, category: "books-hobbies" });
    }

    const firstPage = await fetch(new URL("/discover?category=books-hobbies", baseUrl()));
    const firstHtml = await firstPage.text();
    const cursorMatch = firstHtml.match(/cursor=([^"&]+)/);
    expect(cursorMatch, "expected a Load more cursor link on a 22-post category page").toBeTruthy();

    const cursor = decodeURIComponent(cursorMatch![1]);
    const secondPage = await fetch(
      new URL(`/discover?category=books-hobbies&cursor=${encodeURIComponent(cursor)}`, baseUrl()),
    );
    const secondHtml = await secondPage.text();

    const page1Titles = titles.filter((t) => firstHtml.includes(t));
    const page2Titles = titles.filter((t) => secondHtml.includes(t));
    expect(page1Titles.length).toBeGreaterThan(0);
    expect(page2Titles.length).toBeGreaterThan(0);
    // No post should appear on both pages.
    const overlap = page1Titles.filter((t) => page2Titles.includes(t));
    expect(overlap).toEqual([]);
  });
});

describe("discover: category and search", () => {
  it("filters by category", async () => {
    const author = await registerUser();
    await createPost(author, { title: "Computing category post XYZ", category: "computing" });
    await createPost(author, { title: "Audio category post XYZ", category: "audio" });

    const res = await fetch(new URL("/discover?category=audio", baseUrl()));
    const html = await res.text();
    expect(html).toContain("Audio category post XYZ");
    expect(html).not.toContain("Computing category post XYZ");
  });

  it("searches by title/description text", async () => {
    const author = await registerUser();
    await createPost(author, { title: "Unique Searchable Widget Name 42", description: "generic description" });
    await createPost(author, { title: "Totally different title", description: "nothing special" });

    const res = await fetch(new URL("/discover?q=" + encodeURIComponent("Searchable Widget"), baseUrl()));
    const html = await res.text();
    expect(html).toContain("Unique Searchable Widget Name 42");
    expect(html).not.toContain("Totally different title");
  });
});
