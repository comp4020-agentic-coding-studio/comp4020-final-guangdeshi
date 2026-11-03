// Real-world references (src/external-references.ts), now archived at
// /showcase/references: genuine, source-linked external purchasing
// discussions, never local posts. Against the shared HTTP test server since
// references never touch the database — there's nothing to isolate.
import { describe, expect, it } from "vitest";
import { baseUrl, cookieHeader, registerUser } from "./helpers.ts";
import { EXTERNAL_REFERENCES } from "../src/external-references.ts";

describe("discover: real-world references", () => {
  it("/showcase/references shows only references, marked external, never a vote stat", async () => {
    const res = await fetch(new URL("/showcase/references", baseUrl()));
    expect(res.status).toBe(200);
    const html = await res.text();
    expect(html).toContain('aria-current="page">Researched external discussions<');
    expect(html).toContain("External discussion — not a Buy or Pass post");
    // None of the standard post-card vote markup should ever appear on this tab.
    expect(html).not.toContain("stat-bar-fill");
    expect(html).not.toContain("post-card-demo");
  });

  it("every reference's real source link is present and opens safely in a new tab", async () => {
    const res = await fetch(new URL("/showcase/references", baseUrl()));
    const html = await res.text();
    for (const ref of EXTERNAL_REFERENCES) {
      expect(html, `expected ${ref.id}'s source link in the page`).toContain(ref.sourceUrl);
    }
    expect(html).toContain('rel="noopener noreferrer"');
  });

  it("references never leak into Discover's Products or Questions views, or the demo archive", async () => {
    const [productsHtml, questionsHtml, demoHtml] = await Promise.all([
      fetch(new URL("/discover", baseUrl())).then((r) => r.text()),
      fetch(new URL("/discover?view=questions", baseUrl())).then((r) => r.text()),
      fetch(new URL("/showcase", baseUrl())).then((r) => r.text()),
    ]);
    for (const ref of EXTERNAL_REFERENCES) {
      expect(productsHtml).not.toContain(ref.sourceUrl);
      expect(questionsHtml).not.toContain(ref.sourceUrl);
      expect(demoHtml).not.toContain(ref.sourceUrl);
    }
  });

  it("'Ask your own version of this question' links to the post-creation form with the reference's category preselected", async () => {
    const ref = EXTERNAL_REFERENCES.find((r) => r.id === "ref-budget-espresso-machine")!;
    const html = await (await fetch(new URL("/showcase/references", baseUrl()))).text();
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
