// Catalog over HTTP against the shared test server: product cards, product
// detail, credits, and the flows that connect a catalog product to a real
// Buy or Pass or Which One? post. The buyer's own price and context stay
// theirs to enter; the catalog never supplies a price.
import { describe, expect, it } from "vitest";
import {
  baseUrl,
  cookieHeader,
  getOptionIds,
  registerUser,
  submitComparisonOpinion,
  submitOpinion,
  testImageBytes,
  type Session,
} from "./helpers.ts";

const PRODUCT = "abo-b07pdyw6vm";

async function postForm(session: Session, form: FormData): Promise<Response> {
  form.set("csrf", session.csrfToken);
  return fetch(new URL("/posts/new", baseUrl()), {
    method: "POST",
    redirect: "manual",
    headers: { Cookie: cookieHeader(session) },
    body: form,
  });
}

function postIdFrom(res: Response): string {
  const m = res.headers.get("location")?.match(/\/posts\/([a-f0-9-]{36})/);
  if (!m) throw new Error(`no post id in redirect (status ${res.status})`);
  return m[1];
}

function catalogBuyPassForm(overrides: Record<string, string> = {}): FormData {
  const form = new FormData();
  form.set("title", "Is this speaker worth it for my balcony?");
  form.set("description", "I'd use it outdoors a few evenings a week.");
  form.set("category", "audio");
  form.set("visibility", "public");
  form.set("catalog_product_id", PRODUCT);
  for (const [k, v] of Object.entries(overrides)) form.set(k, v);
  return form;
}

describe("catalog: Discover product cards", () => {
  it("F. the Products view renders image-led product cards with real photos and an Ask action", async () => {
    const html = await (await fetch(new URL("/discover", baseUrl()))).text();
    const cards = html.match(/<article class="product-card"/g) ?? [];
    expect(cards.length).toBe(24);
    expect(html).toMatch(/<img[^>]+src="\/static\/catalog\/abo-[a-z0-9]+\.jpg"/);
    expect(html).toContain("/posts/new?product=");
    expect(html).toContain("Ask about this");
  });

  it("F/O. product cards carry no price, rating, discount or invented engagement", async () => {
    const html = await (await fetch(new URL("/discover?category=gaming", baseUrl()))).text();
    const grid = html.slice(html.indexOf('class="product-grid"'));
    expect(grid).not.toMatch(/\$\d|★|☆|% off|in stock|rating/i);
  });

  it("G. search and category filters reach the catalog, with a count and an empty state", async () => {
    const tripod = await (await fetch(new URL("/discover?q=tripod", baseUrl()))).text();
    expect(tripod).toMatch(/\d+ products? matching/);
    const none = await (await fetch(new URL("/discover?q=zzznomatchzzz", baseUrl()))).text();
    expect(none).toContain("No products match");
  });

  it("H. the pager moves between pages without repeating products", async () => {
    const p1 = await (await fetch(new URL("/discover", baseUrl()))).text();
    const p2 = await (await fetch(new URL("/discover?page=2", baseUrl()))).text();
    expect(p1).toContain("Page 1 of");
    const ids = (h: string) => [...h.matchAll(/href="\/products\/(abo-[a-z0-9]+)"/g)].map((m) => m[1]);
    const a = new Set(ids(p1));
    const b = new Set(ids(p2));
    expect(b.size).toBeGreaterThan(0);
    expect([...b].filter((id) => a.has(id))).toEqual([]);
  });
});

describe("catalog: product detail and credits", () => {
  it("I. a product page shows the photo, facts, attribution, Ask and Compare actions", async () => {
    const res = await fetch(new URL(`/products/${PRODUCT}`, baseUrl()));
    expect(res.status).toBe(200);
    const html = await res.text();
    expect(html).toContain(`/static/catalog/${PRODUCT}.jpg`);
    expect(html).toContain("CC BY 4.0");
    expect(html).toContain("Amazon Berkeley Objects");
    expect(html).toContain(`/posts/new?product=${PRODUCT}`);
    expect(html).toContain("data-compare-toggle");
    expect(html).toContain("no current price or availability");
  });

  it("I. an unknown product id 404s", async () => {
    expect((await fetch(new URL("/products/abo-doesnotexist", baseUrl()))).status).toBe(404);
  });

  it("D. the credits page names the source, licence and paper", async () => {
    const html = await (await fetch(new URL("/credits", baseUrl()))).text();
    expect(html).toContain("CC BY 4.0");
    expect(html).toContain("Amazon.com");
    expect(html).toContain("CVPR 2022");
  });
});

describe("catalog: Buy or Pass with a catalog product", () => {
  it("L. the Ask link prefills the form with the product and a hidden catalog id", async () => {
    const alice = await registerUser();
    const html = await (await fetch(new URL(`/posts/new?product=${PRODUCT}`, baseUrl()), { headers: { Cookie: cookieHeader(alice) } })).text();
    expect(html).toContain(`name="catalog_product_id" value="${PRODUCT}"`);
    expect(html).toContain("Price you've been offered");
  });

  it("L/J. a buyer can publish about a catalog product without uploading a photo; it links both ways", async () => {
    const alice = await registerUser();
    const bob = await registerUser();
    const res = await postForm(alice, catalogBuyPassForm({ price: "79.00", title: `Catalog speaker ${Date.now()}` }));
    expect(res.status).toBe(303);
    const postId = postIdFrom(res);

    const detail = await (await fetch(new URL(`/posts/${postId}`, baseUrl()))).text();
    expect(detail).toContain(`/static/catalog/${PRODUCT}.jpg`);
    expect(detail).toContain(`href="/products/${PRODUCT}"`);

    const product = await (await fetch(new URL(`/products/${PRODUCT}`, baseUrl()))).text();
    expect(product).toContain(`/posts/${postId}`);

    // N. Opinions work exactly as on any other post.
    expect((await submitOpinion(bob, postId, "BUY", "Good value for outdoor use")).status).toBeLessThan(400);
    const after = await (await fetch(new URL(`/posts/${postId}`, baseUrl()))).text();
    expect(after).toContain("Good value for outdoor use");
  });

  it("R. a missing price is allowed — the catalog never fills one in", async () => {
    const alice = await registerUser();
    const res = await postForm(alice, catalogBuyPassForm({ title: `No price ${Date.now()}` }));
    expect(res.status).toBe(303);
    const detail = await (await fetch(new URL(`/posts/${postIdFrom(res)}`, baseUrl()))).text();
    expect(detail).not.toMatch(/AUD\s*\$?\d/);
  });

  it("an unknown catalog id is rejected rather than silently dropped", async () => {
    const alice = await registerUser();
    const res = await postForm(alice, catalogBuyPassForm({ catalog_product_id: "abo-notreal" }));
    expect(res.status).toBe(400);
    expect(await res.text()).toContain("isn&#39;t in the catalog");
  });

  it("K. a custom (non-catalog) product still requires and accepts the buyer's own photo", async () => {
    const alice = await registerUser();
    const noPhoto = new FormData();
    noPhoto.set("title", "Custom thing");
    noPhoto.set("description", "Not in the catalog");
    noPhoto.set("category", "other");
    noPhoto.set("visibility", "public");
    expect((await postForm(alice, noPhoto)).status).toBe(400);

    const withPhoto = new FormData();
    for (const [k, v] of noPhoto.entries()) withPhoto.set(k, v as string);
    withPhoto.set("images", new Blob([new Uint8Array(await testImageBytes())], { type: "image/png" }), "x.png");
    expect((await postForm(alice, withPhoto)).status).toBe(303);
  });

  it("Q. an unlisted catalog-linked post never appears on the product page", async () => {
    const alice = await registerUser();
    const title = `Unlisted catalog ${Date.now()}`;
    const res = await postForm(alice, catalogBuyPassForm({ title, visibility: "unlisted" }));
    expect(res.status).toBe(303);
    const product = await (await fetch(new URL(`/products/${PRODUCT}`, baseUrl()))).text();
    expect(product).not.toContain(title);
  });
});

describe("catalog: Which One? with catalog products", () => {
  async function catalogIds(n: number): Promise<string[]> {
    const html = await (await fetch(new URL("/discover?category=audio", baseUrl()))).text();
    const ids = [...new Set([...html.matchAll(/href="\/products\/(abo-[a-z0-9]+)"/g)].map((m) => m[1]))];
    expect(ids.length).toBeGreaterThanOrEqual(n);
    return ids.slice(0, n);
  }

  it("M. ?compare= with 2-4 products opens the comparison form with each product prefilled", async () => {
    const alice = await registerUser();
    const ids = await catalogIds(3);
    const html = await (await fetch(new URL(`/posts/new?compare=${ids.join(",")}`, baseUrl()), { headers: { Cookie: cookieHeader(alice) } })).text();
    ids.forEach((id, i) => expect(html).toContain(`name="option_catalog_product_id_${i}" value="${id}"`));
    expect(html).toMatch(/value="WHICH_ONE"[^>]*checked|checked[^>]*value="WHICH_ONE"/);
  });

  it("M/N. a comparison of 2 catalog products publishes, takes votes, and links each option back", async () => {
    const alice = await registerUser();
    const bob = await registerUser();
    const ids = await catalogIds(2);
    const form = new FormData();
    form.set("mode", "WHICH_ONE");
    form.set("title", `Which speaker ${Date.now()}`);
    form.set("description", "Small flat, mostly podcasts.");
    form.set("category", "audio");
    form.set("visibility", "public");
    ids.forEach((id, i) => {
      form.set(`option_name_${i}`, `Option ${i + 1}`);
      form.set(`option_price_${i}`, String(50 + i * 10));
      form.set(`option_currency_${i}`, "AUD");
      form.set(`option_catalog_product_id_${i}`, id);
    });
    const res = await postForm(alice, form);
    expect(res.status).toBe(303);
    const postId = postIdFrom(res);

    const detail = await (await fetch(new URL(`/posts/${postId}`, baseUrl()))).text();
    for (const id of ids) {
      expect(detail).toContain(`href="/products/${id}"`);
      expect(detail).toContain(`/static/catalog/${id}.jpg`);
    }
    const optionIds = await getOptionIds(postId);
    expect(optionIds.length).toBe(2);
    expect((await submitComparisonOpinion(bob, postId, { optionId: optionIds[0] }, "First one fits better")).status).toBeLessThan(400);

    const product = await (await fetch(new URL(`/products/${ids[1]}`, baseUrl()))).text();
    expect(product).toContain(`/posts/${postId}`);
  });

  it("M. a comparison option pointing at an unknown catalog id is rejected", async () => {
    const alice = await registerUser();
    const form = new FormData();
    form.set("mode", "WHICH_ONE");
    form.set("title", "Bad compare");
    form.set("description", "x");
    form.set("category", "audio");
    form.set("visibility", "public");
    for (let i = 0; i < 2; i++) {
      form.set(`option_name_${i}`, `O${i}`);
      form.set(`option_price_${i}`, "10");
      form.set(`option_currency_${i}`, "AUD");
    }
    form.set("option_catalog_product_id_1", "abo-notreal");
    const res = await postForm(alice, form);
    expect(res.status).toBe(400);
    expect(await res.text()).toContain("option 2 refers to a product that isn&#39;t in the catalog");
  });
});
