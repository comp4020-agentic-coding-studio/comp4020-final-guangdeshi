// Discover feed: category browsing, search, and "most discussed" sort
// (brief's "popular or actively discussed posts" requirement). The ordering
// test itself — asserting exactly where two specific posts land within
// listMostDiscussed's bounded top-20 window — moved to
// spec/discover-sorting.test.ts, which runs against its own private,
// isolated database rather than the one every file in this suite shares,
// after being found flaky under cross-file interleaving (see that file's
// header comment for the full root-cause account). The test below is safe
// to keep here: it only asserts an unlisted post's absence from the
// results, which holds regardless of how many other posts exist or where
// the top-20 boundary falls, since visibility filtering is a WHERE clause,
// not a LIMIT.
import { describe, expect, it } from "vitest";
import { baseUrl, createPost, registerUser, submitOpinion } from "./helpers.ts";

describe("discover: most discussed sort", () => {
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
