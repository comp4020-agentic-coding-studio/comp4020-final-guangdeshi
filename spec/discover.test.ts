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

    const res = await fetch(new URL("/discover?view=questions&sort=discussed", baseUrl()));
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

    const firstPage = await fetch(new URL("/discover?view=questions&category=books-hobbies", baseUrl()));
    const firstHtml = await firstPage.text();
    const cursorMatch = firstHtml.match(/cursor=([^"&]+)/);
    expect(cursorMatch, "expected a Load more cursor link on a 22-post category page").toBeTruthy();

    const cursor = decodeURIComponent(cursorMatch![1]);
    const secondPage = await fetch(
      new URL(`/discover?view=questions&category=books-hobbies&cursor=${encodeURIComponent(cursor)}`, baseUrl()),
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

    const res = await fetch(new URL("/discover?view=questions&category=audio", baseUrl()));
    const html = await res.text();
    expect(html).toContain("Audio category post XYZ");
    expect(html).not.toContain("Computing category post XYZ");
  });

  it("searches by title/description text", async () => {
    const author = await registerUser();
    await createPost(author, { title: "Unique Searchable Widget Name 42", description: "generic description" });
    await createPost(author, { title: "Totally different title", description: "nothing special" });

    const res = await fetch(new URL("/discover?view=questions&q=" + encodeURIComponent("Searchable Widget"), baseUrl()));
    const html = await res.text();
    expect(html).toContain("Unique Searchable Widget Name 42");
    expect(html).not.toContain("Totally different title");
  });
});

// Discover's two views (Products / Questions) and the legacy ?source= and
// /discover/demo URLs, which now forward rather than break. Demo scenarios
// and external references moved to the /showcase archive.
describe("discover: views and legacy URLs", () => {
  it("a bare /discover defaults to the Products view", async () => {
    const res = await fetch(new URL("/discover", baseUrl()));
    const html = await res.text();
    expect(html).toContain('aria-current="page">Products<');
    expect(html).toContain('class="product-grid"');
  });

  it("?view=questions marks the Questions tab active; an unknown view falls back to Products", async () => {
    const questionsHtml = await (await fetch(new URL("/discover?view=questions", baseUrl()))).text();
    expect(questionsHtml).toContain('aria-current="page">Questions<');
    const bogus = await fetch(new URL("/discover?view=nope", baseUrl()));
    expect(bogus.status).toBe(200);
    expect(await bogus.text()).toContain('aria-current="page">Products<');
  });

  it("only two primary tabs exist — no demo or reference tab in Discover", async () => {
    const html = await (await fetch(new URL("/discover", baseUrl()))).text();
    expect(html).not.toContain("Demo examples");
    expect(html).not.toContain("Real-world examples");
  });

  it("legacy ?source=demo / ?source=references redirect to the showcase archive", async () => {
    const demo = await fetch(new URL("/discover?source=demo", baseUrl()), { redirect: "manual" });
    expect(demo.status).toBe(303);
    expect(new URL(demo.headers.get("location")!, baseUrl()).pathname).toBe("/showcase");
    const refs = await fetch(new URL("/discover?source=references", baseUrl()), { redirect: "manual" });
    expect(refs.status).toBe(303);
    expect(new URL(refs.headers.get("location")!, baseUrl()).pathname).toBe("/showcase/references");
  });

  it("legacy ?source=community keeps its filters and lands on the Questions view", async () => {
    const res = await fetch(new URL("/discover?source=community&category=audio", baseUrl()), { redirect: "manual" });
    expect(res.status).toBe(303);
    const target = new URL(res.headers.get("location")!, baseUrl());
    expect(target.searchParams.get("view")).toBe("questions");
    expect(target.searchParams.get("category")).toBe("audio");
    expect(target.searchParams.get("source")).toBeNull();
  });

  it("GET /discover/demo redirects to the showcase archive (legacy URL stays bookmarkable)", async () => {
    const res = await fetch(new URL("/discover/demo", baseUrl()), { redirect: "manual" });
    expect(res.status).toBe(303);
    expect(new URL(res.headers.get("location")!, baseUrl()).pathname).toBe("/showcase");
  });

  it("the sort links on the Questions view carry view and category forward", async () => {
    const html = await (await fetch(new URL("/discover?view=questions&category=computing", baseUrl()))).text();
    const sortLinkMatch = html.match(/href="\/discover\?([^"]*sort=discussed[^"]*)"/);
    expect(sortLinkMatch, "expected a 'Most discussed' link on the page").toBeTruthy();
    const sortParams = new URLSearchParams(sortLinkMatch![1].replace(/&amp;/g, "&"));
    expect(sortParams.get("view")).toBe("questions");
    expect(sortParams.get("category")).toBe("computing");
  });

  it("a Questions filter with zero matches shows a specific empty state with a reset link and a path to products", async () => {
    const res = await fetch(new URL("/discover?view=questions&category=vehicles&q=" + encodeURIComponent(`NoSuchPostAnywhere${Date.now()}`), baseUrl()));
    const html = await res.text();
    expect(html).toContain("No questions match");
    expect(html).toContain("Clear filters");
    expect(html).toContain("Browse products");
  });
});
