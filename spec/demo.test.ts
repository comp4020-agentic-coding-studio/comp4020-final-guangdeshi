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

// Demo scenarios moved out of Discover into the /showcase archive (the
// product catalog redesign). /discover/demo and ?source=demo forward there.
// The tests below keep proving the archive is public, always labelled, and
// never mixes real posts in.
describe("demo content: the showcase archive", () => {
  it("/discover/demo is reachable without logging in and lands on the labelled archive", async () => {
    const res = await fetch(new URL("/discover/demo", baseUrl()));
    expect(res.status).toBe(200);
    const html = await res.text();
    expect(html).toContain("Showcase archive");
    expect(html).toContain("fictional");
  });

  it("never mixes a real post into the demo-only view", async () => {
    const alice = await registerUser();
    const postId = await createPost(alice, { title: "A genuinely real purchasing question XYZ999" });
    // Sanity: it's real (shows in the normal feed and detail page).
    const detail = await fetch(new URL(`/posts/${postId}`, baseUrl()));
    expect((await detail.text())).toContain("A genuinely real purchasing question XYZ999");

    const demoFeed = await fetch(new URL("/showcase", baseUrl()));
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
