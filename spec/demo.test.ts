// Feature D: demo content. The HTTP-level spec here covers what's testable
// without an admin account — this test environment runs with no
// ADMIN_BOOTSTRAP_SECRET set (see spec/admin-bootstrap.test.ts's own note),
// so POST /admin/demo/seed can only be exercised for its auth/authorization
// boundary over HTTP, not its actual seeding behavior. The seeding script's
// own correctness (idempotent re-run, real content produced, images
// processed, FTS5 indexed) was verified directly during development by
// running scripts/seed-demo-content.ts against a throwaway database and
// inspecting the result — see the "Demo content seeding" section of
// PROCESS.md for that record — rather than faked here as an HTTP test.
import { describe, expect, it } from "vitest";
import { apiCall, baseUrl, createPost, registerUser } from "./helpers.ts";

describe("demo content: admin seeding is properly gated", () => {
  it("requires authentication", async () => {
    const res = await fetch(new URL("/admin/demo/seed", baseUrl()), { method: "POST", redirect: "manual" });
    expect(res.status).toBe(401);
  });

  it("rejects a non-admin authenticated user", async () => {
    const alice = await registerUser();
    const res = await apiCall(alice, "/admin/demo/seed", { method: "POST" });
    expect(res.status).toBe(403);
  });
});

// The Discover content-experience refinement folded the formerly-separate
// "Explore Demo" page into the unified /discover with ?source=demo (see
// handleDemoFeed in src/server.ts, now a 303 redirect rather than its own
// page/template) — /discover/demo is kept as a working, bookmarkable URL
// for anyone who already linked it, it just forwards into the same page
// spec/discover.test.ts covers in depth. The tests below (still reachable
// without login, never mixing real content into the demo view) are kept
// here rather than deleted, since they're specifically about that legacy
// URL's compatibility and the is_demo isolation it was always there to
// prove, not about Discover's general filtering logic.
describe("demo content: the public demo-examples surface", () => {
  it("/discover/demo is reachable without logging in and lands on the demo view", async () => {
    const res = await fetch(new URL("/discover/demo", baseUrl()));
    expect(res.status).toBe(200);
    const html = await res.text();
    expect(html).toContain("Discover");
    expect(html).toContain("Explore fictional purchasing scenarios");
  });

  it("never mixes a real post into the demo-only view", async () => {
    const alice = await registerUser();
    const postId = await createPost(alice, { title: "A genuinely real purchasing question XYZ999" });
    // Sanity: it's real (shows in the normal feed and detail page).
    const detail = await fetch(new URL(`/posts/${postId}`, baseUrl()));
    expect((await detail.text())).toContain("A genuinely real purchasing question XYZ999");

    const demoFeed = await fetch(new URL("/discover?source=demo", baseUrl()));
    const demoHtml = await demoFeed.text();
    expect(demoHtml).not.toContain("A genuinely real purchasing question XYZ999");
  });

  it("never shows a real post with the demo banner or tag", async () => {
    const alice = await registerUser();
    const postId = await createPost(alice, { title: "Another real post, not a demo one" });
    const res = await fetch(new URL(`/posts/${postId}`, baseUrl()));
    const html = await res.text();
    expect(html).not.toContain("Demo scenario — AI-generated fictional content");
  });
});
