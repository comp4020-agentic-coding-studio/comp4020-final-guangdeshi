// Pure unit tests — no HTTP, no running server required — for the password
// hashing and validation logic that's cheapest and most important to test in
// isolation. Still runs under the same global setup, so a server must be
// reachable at APP_URL for the whole suite to start, even though this file
// never calls fetch.
import { describe, expect, it } from "vitest";
import { hashPassword, verifyPassword, isValidEmail, isValidHandle, isValidPassword } from "../src/auth.ts";
import { validateOpinionInput, validatePostInput, normalizeTags, escapeHtml } from "../src/validation.ts";
import { postCard, referenceCard } from "../src/render.ts";
import type { Post } from "../src/db.ts";

describe("password hashing", () => {
  it("hashes never equal the plaintext and verify correctly", () => {
    const hash = hashPassword("correct horse battery staple");
    expect(hash).not.toContain("correct horse battery staple");
    expect(verifyPassword("correct horse battery staple", hash)).toBe(true);
  });

  it("rejects an incorrect password", () => {
    const hash = hashPassword("the-real-password");
    expect(verifyPassword("not-the-real-password", hash)).toBe(false);
  });

  it("produces a different hash (different salt) for the same password each time", () => {
    const a = hashPassword("same-password-123");
    const b = hashPassword("same-password-123");
    expect(a).not.toBe(b);
    expect(verifyPassword("same-password-123", a)).toBe(true);
    expect(verifyPassword("same-password-123", b)).toBe(true);
  });

  it("encodes algorithm and parameters alongside the hash", () => {
    const hash = hashPassword("whatever");
    expect(hash.startsWith("scrypt$N=")).toBe(true);
  });

  it("keeps scrypt's memory cost (128*N*r bytes) well under this app's 256MB production machine", () => {
    // Regression guard for a real incident (PROCESS.md, "A real production
    // incident"): N=131072 cost ~128MB per hash call and alone crash-looped
    // the live 256MB Fly machine on OOM kills, since a dummy hash is
    // computed at module load on every boot. This asserts the actual
    // parameter encoded in a fresh hash stays in a safe range rather than
    // trusting a comment not to regress.
    const hash = hashPassword("budget-check");
    const match = hash.match(/^scrypt\$N=(\d+),r=(\d+),p=(\d+)\$/);
    expect(match).not.toBeNull();
    const [, nStr, rStr] = match!;
    const memoryBytes = 128 * Number(nStr) * Number(rStr);
    expect(memoryBytes).toBeLessThanOrEqual(32 * 1024 * 1024); // 32MB ceiling, well under 256MB total
  });

  it("rejects malformed stored hashes rather than throwing", () => {
    expect(verifyPassword("anything", "not-a-real-hash")).toBe(false);
  });
});

describe("email/handle/password validation", () => {
  it("accepts well-formed emails and rejects malformed ones", () => {
    expect(isValidEmail("person@example.com")).toBe(true);
    expect(isValidEmail("not-an-email")).toBe(false);
    expect(isValidEmail("missing@domain")).toBe(false);
    expect(isValidEmail("@example.com")).toBe(false);
  });

  it("accepts well-formed handles and rejects malformed ones", () => {
    expect(isValidHandle("alice")).toBe(true);
    expect(isValidHandle("alice_the-2nd")).toBe(true);
    expect(isValidHandle("al")).toBe(false); // too short
    expect(isValidHandle("Alice")).toBe(false); // must be lowercase
    expect(isValidHandle("has spaces")).toBe(false);
  });

  it("enforces a minimum password length", () => {
    expect(isValidPassword("short")).toBe(false);
    expect(isValidPassword("longenough123")).toBe(true);
  });
});

describe("post input validation", () => {
  it("requires a title, description, and valid category", () => {
    const result = validatePostInput({ title: "", description: "", categoryId: "not-a-real-category", visibility: "public" });
    expect(result.ok).toBe(false);
    expect(result.errors.length).toBeGreaterThan(0);
  });

  it("accepts a fully valid post input", () => {
    const result = validatePostInput({
      title: "A reasonable title",
      description: "A reasonable description of why I want this.",
      categoryId: "computing",
      visibility: "public",
      tags: ["dev", "ai"],
    });
    expect(result.ok).toBe(true);
  });

  it("rejects an invalid visibility value", () => {
    const result = validatePostInput({
      title: "Title",
      description: "Description text here",
      categoryId: "computing",
      visibility: "private", // not a real option — only public/unlisted
    });
    expect(result.ok).toBe(false);
  });
});

describe("opinion input validation", () => {
  it("requires stance to be BUY or PASS", () => {
    expect(validateOpinionInput({ stance: "BUY", comment: "ok" }).ok).toBe(true);
    expect(validateOpinionInput({ stance: "PASS", comment: "ok" }).ok).toBe(true);
    expect(validateOpinionInput({ stance: "MAYBE", comment: "ok" }).ok).toBe(false);
  });

  it("requires a non-empty comment", () => {
    expect(validateOpinionInput({ stance: "BUY", comment: "" }).ok).toBe(false);
    expect(validateOpinionInput({ stance: "BUY", comment: "   " }).ok).toBe(false);
  });
});

describe("tag normalization", () => {
  it("lowercases, trims, dedupes, and caps tag count", () => {
    const tags = normalizeTags(["  Dev ", "dev", "AI", "ai", "a", "b", "c", "d", "e", "f", "g", "h", "i"]);
    expect(tags).toContain("dev");
    expect(tags).toContain("ai");
    expect(new Set(tags).size).toBe(tags.length);
    expect(tags.length).toBeLessThanOrEqual(8);
  });
});

describe("XSS escaping", () => {
  it("escapes HTML-significant characters", () => {
    const escaped = escapeHtml(`<script>alert('xss')</script>`);
    expect(escaped).not.toContain("<script>");
    expect(escaped).toContain("&lt;script&gt;");
  });
});

function makePost(overrides: Partial<Post> = {}): Post {
  return {
    id: "00000000-0000-0000-0000-000000000000",
    authorId: "author-1",
    title: "A test post",
    description: "d",
    priceCents: null,
    currency: null,
    categoryId: "computing",
    tags: [],
    visibility: "public",
    status: "active",
    mode: "BUY_PASS",
    isDemo: false,
    catalogProductId: null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    ...overrides,
  };
}

// 9. Demo labels remain visible — a pure render-function unit test (no
// database, no server) for postCard's own demo-tag rendering, the single
// piece every Discover source view (and the landing page's demo preview)
// relies on to keep a fictional scenario visually unmistakable.
describe("postCard: demo label and mode tag rendering", () => {
  const cardOpts = {
    coverImageId: null,
    authorHandle: "demo-taylor",
    authorDisplayName: "Taylor (Demo)",
    categoryName: "Computing & Tech",
    buyCount: 0,
    passCount: 0,
  };

  it("renders the demo tag on an isDemo post and never on a real one", () => {
    const demoHtml = postCard(makePost({ isDemo: true }), cardOpts);
    expect(demoHtml).toContain("🤖 Demo");
    expect(demoHtml).toContain("post-card-demo");

    const realHtml = postCard(makePost({ isDemo: false }), cardOpts);
    expect(realHtml).not.toContain("🤖 Demo");
    expect(realHtml).not.toContain("post-card-demo");
  });

  it("renders the Which One? tag only for a WHICH_ONE post, independent of demo status", () => {
    const comparisonHtml = postCard(makePost({ mode: "WHICH_ONE" }), cardOpts);
    expect(comparisonHtml).toContain("Which One?");

    const buyPassHtml = postCard(makePost({ mode: "BUY_PASS" }), cardOpts);
    expect(buyPassHtml).not.toContain("Which One?");

    const demoComparisonHtml = postCard(makePost({ mode: "WHICH_ONE", isDemo: true }), cardOpts);
    expect(demoComparisonHtml).toContain("🤖 Demo");
    expect(demoComparisonHtml).toContain("Which One?");
  });

  it("never shows a fabricated vote statistic: zero real opinions renders as an explicit 'No opinions yet', not a 0% bar implying real engagement", () => {
    const html = postCard(makePost(), { ...cardOpts, buyCount: 0, passCount: 0 });
    expect(html).toContain("No opinions yet");
    expect(html).not.toContain("stat-bar-fill");
  });

  it("a comparison post with zero real opinions also renders 'No opinions yet', not a fabricated comparison count", () => {
    const html = postCard(makePost({ mode: "WHICH_ONE" }), { ...cardOpts, comparisonOpinionCount: 0 });
    expect(html).toContain("No opinions yet");
  });
});

describe("referenceCard: real-world reference rendering", () => {
  const baseRef = {
    id: "ref-test",
    title: "A real external discussion",
    categoryId: "computing",
    categoryName: "Computing & Tech",
    sourceUrl: "https://forums.example.com/thread/123",
    sourcePlatform: "Example Forums",
    sourceDate: "2020-01-01",
    summary: "A verified summary of the real discussion.",
    knownGaps: "The final purchase was never confirmed.",
    imageUrl: null as string | null,
    imageIsRepresentative: false,
  };

  it("always shows the external badge and never any vote-stat markup", () => {
    const html = referenceCard(baseRef);
    expect(html).toContain("External discussion — not a Buy or Pass post");
    expect(html).not.toContain("stat-bar-fill");
    expect(html).not.toContain("post-card-demo");
  });

  it("links to the real source URL with rel=noopener noreferrer and opens in a new tab", () => {
    const html = referenceCard(baseRef);
    expect(html).toContain(`href="${baseRef.sourceUrl}"`);
    expect(html).toContain('target="_blank"');
    expect(html).toContain('rel="noopener noreferrer"');
  });

  it("links 'Ask your own version' to /posts/new with the reference's own category preselected", () => {
    const html = referenceCard(baseRef);
    expect(html).toContain(`/posts/new?category=${baseRef.categoryId}`);
  });

  it("shows a 'Representative photo' tag only when an image is present and marked representative", () => {
    const withRepImage = referenceCard({ ...baseRef, imageUrl: "/static/assets/references/x.jpg", imageIsRepresentative: true });
    expect(withRepImage).toContain("Representative photo");

    const withExactImage = referenceCard({ ...baseRef, imageUrl: "/static/assets/references/x.jpg", imageIsRepresentative: false });
    expect(withExactImage).not.toContain("Representative photo");

    const withNoImage = referenceCard({ ...baseRef, imageUrl: null, imageIsRepresentative: true });
    expect(withNoImage).not.toContain("Representative photo");
    expect(withNoImage).toContain("reference-card-image-placeholder");
  });

  it("always renders the knownGaps text, never hiding what the source doesn't say", () => {
    const html = referenceCard(baseRef);
    expect(html).toContain("The final purchase was never confirmed.");
  });
});
