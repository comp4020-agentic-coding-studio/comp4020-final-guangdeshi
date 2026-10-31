// Real-world references (src/external-references.ts, Discover's
// "Real-world examples" tab): genuine, source-linked external purchasing
// discussions, never local posts. Against the shared HTTP test server since
// references never touch the database — there's nothing to isolate.
import { describe, expect, it } from "vitest";
import { baseUrl, cookieHeader, registerUser } from "./helpers.ts";
import { EXTERNAL_REFERENCES } from "../src/external-references.ts";

describe("discover: real-world references", () => {
  it("source=references shows only references, marked external, never a vote stat", async () => {
    const res = await fetch(new URL("/discover?source=references", baseUrl()));
    expect(res.status).toBe(200);
    const html = await res.text();
    expect(html).toContain('aria-current="page">Real-world examples<');
    expect(html).toContain("External discussion — not a Buy or Pass post");
    // None of the standard post-card vote markup should ever appear on this tab.
    expect(html).not.toContain("stat-bar-fill");
    expect(html).not.toContain("post-card-demo");
  });

  it("every reference's real source link is present and opens safely in a new tab", async () => {
    const res = await fetch(new URL("/discover?source=references", baseUrl()));
    const html = await res.text();
    for (const ref of EXTERNAL_REFERENCES) {
      expect(html, `expected ${ref.id}'s source link in the page`).toContain(ref.sourceUrl);
    }
    expect(html).toContain('rel="noopener noreferrer"');
  });

  it("category filter narrows references the same way it narrows posts", async () => {
    const res = await fetch(new URL("/discover?source=references&category=computing", baseUrl()));
    const html = await res.text();
    const computingRefs = EXTERNAL_REFERENCES.filter((r) => r.categoryId === "computing");
    const otherRefs = EXTERNAL_REFERENCES.filter((r) => r.categoryId !== "computing");
    for (const ref of computingRefs) {
      expect(html).toContain(ref.title);
    }
    for (const ref of otherRefs) {
      expect(html).not.toContain(ref.sourceUrl);
    }
  });

  it("search filters references by title/summary text", async () => {
    const target = EXTERNAL_REFERENCES.find((r) => r.id === "ref-budget-mechanical-keyboard")!;
    const res = await fetch(new URL("/discover?source=references&q=keyboard", baseUrl()));
    const html = await res.text();
    expect(html).toContain(target.title);
  });

  it("a category with zero references shows the references-specific empty message, not the posts one", async () => {
    const res = await fetch(new URL("/discover?source=references&category=vehicles", baseUrl()));
    const html = await res.text();
    const vehicleRefs = EXTERNAL_REFERENCES.filter((r) => r.categoryId === "vehicles");
    expect(vehicleRefs.length, "test assumes no reference is tagged vehicles").toBe(0);
    expect(html).toContain("No real-world examples in this category yet.");
  });

  it("references never leak into source=all, source=community, or source=demo", async () => {
    const [allHtml, communityHtml, demoHtml] = await Promise.all([
      fetch(new URL("/discover", baseUrl())).then((r) => r.text()),
      fetch(new URL("/discover?source=community", baseUrl())).then((r) => r.text()),
      fetch(new URL("/discover?source=demo", baseUrl())).then((r) => r.text()),
    ]);
    for (const ref of EXTERNAL_REFERENCES) {
      expect(allHtml).not.toContain(ref.sourceUrl);
      expect(communityHtml).not.toContain(ref.sourceUrl);
      expect(demoHtml).not.toContain(ref.sourceUrl);
    }
  });

  it("an invalid source value never resolves to references by accident", async () => {
    const res = await fetch(new URL("/discover?source=reference", baseUrl())); // singular, not the real key
    const html = await res.text();
    expect(html).toContain('aria-current="page">All questions<');
  });

  it("the sort toggle is omitted on the references tab (sorting a static list is meaningless)", async () => {
    const res = await fetch(new URL("/discover?source=references", baseUrl()));
    const html = await res.text();
    expect(html).not.toContain("Most discussed");
  });

  it("'Ask your own version of this question' links to the post-creation form with the reference's category preselected", async () => {
    const ref = EXTERNAL_REFERENCES.find((r) => r.id === "ref-budget-espresso-machine")!;
    const res = await fetch(new URL("/discover?source=references&category=home-kitchen", baseUrl()));
    const html = await res.text();
    expect(html).toContain(`/posts/new?category=${encodeURIComponent(ref.categoryId)}`);
  });

  it("a reference id is never routable as a post id — no accidental collision with /posts/:id", async () => {
    const ref = EXTERNAL_REFERENCES[0];
    const res = await fetch(new URL(`/posts/${ref.id}`, baseUrl()));
    expect(res.status).toBe(404);
  });
});

describe("post creation: category preselection from a reference link", () => {
  it("GET /posts/new?category=<validId>, logged in, preselects that category in the form", async () => {
    const session = await registerUser();
    const res = await fetch(new URL("/posts/new?category=home-kitchen", baseUrl()), {
      headers: { Cookie: cookieHeader(session) },
    });
    expect(res.status).toBe(200);
    const html = await res.text();
    expect(html).toContain('<option value="home-kitchen" selected>');
  });

  it("GET /posts/new?category=<bogus>, logged in, falls back to no preselection rather than trusting an invalid value", async () => {
    const session = await registerUser();
    const res = await fetch(new URL("/posts/new?category=not-a-real-category", baseUrl()), {
      headers: { Cookie: cookieHeader(session) },
    });
    expect(res.status).toBe(200);
    const html = await res.text();
    expect(html).toContain('<option value="" disabled selected>Choose a category…</option>');
  });
});
