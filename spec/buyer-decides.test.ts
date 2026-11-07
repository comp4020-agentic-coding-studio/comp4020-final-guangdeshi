// "The purchase belongs to the buyer." The community's votes never become a
// decision: a lopsided vote produces no outcome, the buyer can record the
// opposite of the majority and that is what everyone sees, and recording it
// changes no count. A regression that derived an outcome, a "recommended"
// option or a verdict from the votes would fail here, whatever it was named.
import { describe, expect, it } from "vitest";
import {
  apiCall,
  baseUrl,
  createComparisonPost,
  createPost,
  getOptionIds,
  registerUser,
  submitComparisonOpinion,
  submitOpinion,
  type Session,
} from "./helpers.ts";

async function publicPage(postId: string): Promise<string> {
  return (await fetch(new URL(`/posts/${postId}`, baseUrl()))).text();
}

async function recordOutcome(session: Session, postId: string, fields: Record<string, string>): Promise<Response> {
  return apiCall(session, `/posts/${postId}/outcome`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ csrf: session.csrfToken, ...fields }),
  });
}

describe("the buyer decides; votes never do", () => {
  it("a lopsided Buy/Pass vote produces no outcome until the buyer records one", async () => {
    const buyer = await registerUser();
    const postId = await createPost(buyer);
    for (const stance of ["BUY", "BUY", "BUY", "PASS"] as const) {
      expect((await submitOpinion(await registerUser(), postId, stance, `I'd say ${stance}`)).status).toBe(200);
    }

    const html = await publicPage(postId);
    expect(html).toContain("👍 3 Buy");
    expect(html).toContain("👎 1 Pass");
    expect(html).not.toContain("outcome-badge");
    expect(html).toContain('<div data-live-region="outcome"></div>');
    expect(html).not.toContain("outcome-card");
  });

  it("the buyer can decide against the majority, and the page shows the buyer's decision with the counts unchanged", async () => {
    const buyer = await registerUser();
    const postId = await createPost(buyer);
    for (let i = 0; i < 3; i++) {
      expect((await submitOpinion(await registerUser(), postId, "BUY", "Go for it")).status).toBe(200);
    }

    expect((await recordOutcome(buyer, postId, { status: "DID_NOT_BUY" })).status).toBe(200);

    const html = await publicPage(postId);
    expect(html).toContain("outcome-not-bought");
    expect(html).not.toContain("outcome-bought\"");
    expect(html).toContain("👍 3 Buy");
    expect(html).toContain("👎 0 Pass");
  });

  it("a comparison majority never marks an option as chosen; only the buyer's own record does", async () => {
    const buyer = await registerUser();
    const postId = await createComparisonPost(buyer, [
      { name: "Popular option", priceCents: 10000 },
      { name: "Unpopular option", priceCents: 20000 },
    ]);
    const [popular, unpopular] = await getOptionIds(postId);
    for (let i = 0; i < 3; i++) {
      expect((await submitComparisonOpinion(await registerUser(), postId, { optionId: popular }, "This one")).status).toBe(200);
    }

    const before = await publicPage(postId);
    expect(before).not.toContain("outcome-badge");
    expect(before).not.toContain("outcome-purchased");

    expect((await recordOutcome(buyer, postId, { status: "BOUGHT", purchasedOptionId: unpopular })).status).toBe(200);
    const after = await publicPage(postId);
    expect(after).toContain('<p class="outcome-purchased">Bought: Unpopular option</p>');
    expect(after).toContain("3 opinions");
  });
});
