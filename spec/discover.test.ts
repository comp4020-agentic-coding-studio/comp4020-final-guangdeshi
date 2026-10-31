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

// Content-source views (All questions / Community / Demo examples). The
// per-source *filtering correctness* (does source=X actually include/
// exclude the right rows) is covered end to end in
// spec/discover-sources.test.ts against an isolated database, since
// creating an is_demo=1 post requires calling src/db.ts directly. What
// belongs here, against the shared HTTP test server, is the request/response
// *plumbing* around that: default behavior, invalid-input handling, the
// legacy URL redirect, and that the three tabs/empty-state render with the
// right text and links for a real request.
describe("discover: content-source param handling", () => {
  it("a bare /discover (no ?source=) defaults to the 'all' view, not silently to 'community'", async () => {
    const res = await fetch(new URL("/discover", baseUrl()));
    const html = await res.text();
    expect(html).toContain('aria-current="page">All questions<');
  });

  it("an invalid ?source= value falls back to 'all' rather than erroring or silently narrowing", async () => {
    const res = await fetch(new URL("/discover?source=not-a-real-source", baseUrl()));
    expect(res.status).toBe(200);
    const html = await res.text();
    expect(html).toContain('aria-current="page">All questions<');
  });

  it("?source=community and ?source=demo each mark their own tab active", async () => {
    const communityHtml = await (await fetch(new URL("/discover?source=community", baseUrl()))).text();
    expect(communityHtml).toContain('aria-current="page">Community<');
    const demoHtml = await (await fetch(new URL("/discover?source=demo", baseUrl()))).text();
    expect(demoHtml).toContain('aria-current="page">Demo examples<');
    expect(demoHtml).toContain("Explore fictional purchasing scenarios");
  });

  it("GET /discover/demo redirects into the unified page with source=demo selected (legacy URL stays bookmarkable)", async () => {
    const res = await fetch(new URL("/discover/demo", baseUrl()), { redirect: "manual" });
    expect(res.status).toBe(303);
    const location = res.headers.get("location")!;
    const redirectedUrl = new URL(location, baseUrl());
    expect(redirectedUrl.pathname).toBe("/discover");
    expect(redirectedUrl.searchParams.get("source")).toBe("demo");
  });

  it("/discover/demo preserves an existing category filter through the redirect", async () => {
    const res = await fetch(new URL("/discover/demo?category=audio", baseUrl()), { redirect: "manual" });
    const location = res.headers.get("location")!;
    const redirectedUrl = new URL(location, baseUrl());
    expect(redirectedUrl.searchParams.get("category")).toBe("audio");
    expect(redirectedUrl.searchParams.get("source")).toBe("demo");
  });

  it("the search and sort links on the page carry the current ?source= forward, so a filter combination survives navigation", async () => {
    const res = await fetch(new URL("/discover?source=community&category=computing", baseUrl()));
    const html = await res.text();
    // The "Most discussed" sort link must keep both the chosen source and
    // category, not silently reset either one when a visitor clicks it.
    const sortLinkMatch = html.match(/href="\/discover\?([^"]*sort=discussed[^"]*)"/);
    expect(sortLinkMatch, "expected a 'Most discussed' link on the page").toBeTruthy();
    const sortParams = new URLSearchParams(sortLinkMatch![1]);
    expect(sortParams.get("source")).toBe("community");
    expect(sortParams.get("category")).toBe("computing");
  });

  it("a category with zero matches in the current source shows a specific empty state with a reset link and a cross-link to demo examples, not a bare blank page", async () => {
    const res = await fetch(new URL("/discover?source=community&category=vehicles&q=" + encodeURIComponent(`NoSuchPostAnywhere${Date.now()}`), baseUrl()));
    const html = await res.text();
    expect(html).toContain("Nothing here yet");
    expect(html).toContain("Reset category");
    expect(html).toContain("See demo examples instead");
  });
});
