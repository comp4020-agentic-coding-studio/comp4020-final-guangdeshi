// Real product catalog domain (src/catalog.ts, migration 0008): import
// idempotency, dedup, category mapping, licence/provenance retention, image
// validity, catalog browsing, and which posts count as a product's "community
// questions". Runs against its own private database, the same way
// discover-sources.test.ts does, because creating demo/unlisted fixtures and
// inspecting catalog rows needs direct src/db.ts / src/catalog.ts access.
import { randomUUID } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import sharp from "sharp";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const TEST_DB_DIR = `./data/catalog-test-${randomUUID()}`;
process.env.DATABASE_PATH = `${TEST_DB_DIR}/db.sqlite`;
process.env.UPLOAD_DIR = `${TEST_DB_DIR}/uploads`;
mkdirSync(TEST_DB_DIR, { recursive: true });

const { db, createUser, createDemoUser, createPost, setPurchaseOptions, listCategories } = await import("../src/db.ts");
const catalog = await import("../src/catalog.ts");

const manifest = JSON.parse(readFileSync(catalog.CATALOG_MANIFEST_PATH, "utf8")) as import("../src/catalog.ts").CatalogManifest;
const selection = JSON.parse(readFileSync("data-sources/abo-catalog-selection.json", "utf8"));

afterAll(() => {
  if (existsSync(TEST_DB_DIR)) rmSync(TEST_DB_DIR, { recursive: true, force: true });
});

beforeAll(() => {
  catalog.syncCatalog(manifest);
});

function count(sql: string, ...params: any[]): number {
  return (db.prepare(sql).get(...params) as any).n;
}

function makeUser(prefix: string) {
  const id = randomUUID().slice(0, 8);
  return createUser(`${prefix}${id}@example.com`, `${prefix}${id}`, "not-a-real-hash", prefix);
}

describe("catalog import", () => {
  it("A. imports every manifest product, between 50 and 80 of them", () => {
    expect(manifest.products.length).toBeGreaterThanOrEqual(50);
    expect(manifest.products.length).toBeLessThanOrEqual(80);
    expect(count(`SELECT COUNT(*) AS n FROM catalog_products`)).toBe(manifest.products.length);
    expect(count(`SELECT COUNT(*) AS n FROM catalog_product_images`)).toBe(manifest.products.length);
  });

  it("B. re-running the sync is idempotent: no duplicate products, images or attributes", () => {
    const before = {
      products: count(`SELECT COUNT(*) AS n FROM catalog_products`),
      images: count(`SELECT COUNT(*) AS n FROM catalog_product_images`),
      attrs: count(`SELECT COUNT(*) AS n FROM catalog_product_attributes`),
    };
    const result = catalog.syncCatalog(manifest);
    expect(result.inserted).toBe(0);
    expect(result.updated).toBe(manifest.products.length);
    expect(count(`SELECT COUNT(*) AS n FROM catalog_products`)).toBe(before.products);
    expect(count(`SELECT COUNT(*) AS n FROM catalog_product_images`)).toBe(before.images);
    expect(count(`SELECT COUNT(*) AS n FROM catalog_product_attributes`)).toBe(before.attrs);
  });

  it("B. the curated selection has no duplicate source items, and ids are stable", () => {
    const ids = selection.products.map((p: any) => p.sourceId);
    expect(new Set(ids).size).toBe(ids.length);
    expect(catalog.catalogProductId("abo", "B07PDYW6VM")).toBe("abo-b07pdyw6vm");
  });

  it("C. every product maps to a real app category", () => {
    const valid = new Set(listCategories().map((c) => c.id));
    for (const p of manifest.products) expect(valid.has(p.categoryId), p.sourceItemId).toBe(true);
    expect(count(`SELECT COUNT(*) AS n FROM catalog_products cp LEFT JOIN categories c ON c.id = cp.category_id WHERE c.id IS NULL`)).toBe(0);
    // Broad coverage, not one category dominating.
    const counts = catalog.catalogCategoryCounts();
    expect(Object.keys(counts).length).toBeGreaterThanOrEqual(8);
  });

  it("D. licence, attribution and per-image provenance are stored", () => {
    const source = catalog.getCatalogSource("abo")!;
    expect(source.license).toBe("CC BY 4.0");
    expect(source.licenseUrl).toContain("creativecommons.org/licenses/by/4.0");
    expect(source.attribution).toContain("Amazon.com");
    const missing = count(
      `SELECT COUNT(*) AS n FROM catalog_product_images WHERE source_image_id = '' OR source_image_url NOT LIKE 'https://amazon-berkeley-objects.s3.amazonaws.com/images/original/%'`,
    );
    expect(missing).toBe(0);
    const p = catalog.getCatalogProduct("abo-b07pdyw6vm")!;
    expect(p.originalTitle.length).toBeGreaterThan(0);
    expect(p.sourceItemId).toBe("B07PDYW6VM");
  });

  it("D. never stores a price, rating, review, stock or discount", () => {
    const columns = ["catalog_products", "catalog_product_attributes", "catalog_product_images"].flatMap((t) =>
      (db.prepare(`PRAGMA table_info(${t})`).all() as any[]).map((c) => c.name as string),
    );
    for (const banned of ["price", "rating", "review", "stock", "discount"]) {
      expect(columns.some((c) => c.includes(banned)), banned).toBe(false);
    }
    const attrNames = (db.prepare(`SELECT DISTINCT name FROM catalog_product_attributes`).all() as any[]).map((r) => r.name.toLowerCase());
    for (const banned of ["price", "rating", "review", "stock", "discount"]) {
      expect(attrNames.some((n: string) => n.includes(banned)), banned).toBe(false);
    }
  });

  it("E. every catalog image file exists, decodes, and is large enough for a detail page", async () => {
    for (const p of manifest.products) {
      const file = join("src/public/catalog", p.image.file);
      expect(existsSync(file), file).toBe(true);
      const meta = await sharp(file, { failOn: "error" }).metadata();
      expect(meta.format).toBe("jpeg");
      expect(meta.width).toBe(p.image.width);
      expect(meta.height).toBe(p.image.height);
      expect(Math.max(meta.width!, meta.height!), file).toBeGreaterThanOrEqual(1000);
      expect(Math.min(p.image.originalWidth, p.image.originalHeight)).toBeGreaterThanOrEqual(1000);
    }
  });
});

describe("catalog browsing", () => {
  it("G. category filter returns only that category", () => {
    const page = catalog.listCatalog({ categoryId: "audio", pageSize: 60 });
    expect(page.total).toBeGreaterThan(0);
    for (const c of page.cards) expect(c.product.categoryId).toBe("audio");
  });

  it("G. search matches name and brand, and escapes LIKE wildcards", () => {
    const tripod = catalog.listCatalog({ search: "tripod" });
    expect(tripod.total).toBeGreaterThan(0);
    for (const c of tripod.cards) expect(`${c.product.name} ${c.product.originalTitle} ${c.product.productType}`.toLowerCase()).toContain("tripod");
    expect(catalog.listCatalog({ search: "%" }).total).toBe(0);
    expect(catalog.listCatalog({ search: "zzznomatchzzz" }).total).toBe(0);
  });

  it("H. pagination covers every product exactly once", () => {
    const seen: string[] = [];
    const first = catalog.listCatalog({ pageSize: 10 });
    for (let page = 1; page <= first.totalPages; page++) {
      seen.push(...catalog.listCatalog({ pageSize: 10, page }).cards.map((c) => c.product.id));
    }
    expect(seen.length).toBe(manifest.products.length);
    expect(new Set(seen).size).toBe(seen.length);
  });

  it("H. an out-of-range page clamps instead of erroring", () => {
    const res = catalog.listCatalog({ pageSize: 24, page: 999 });
    expect(res.page).toBe(res.totalPages);
    expect(res.cards.length).toBeGreaterThan(0);
  });

  it("H. the unfiltered first page spans many categories (interleaved, not one category first)", () => {
    const cats = new Set(catalog.listCatalog({ pageSize: 12 }).cards.map((c) => c.product.categoryId));
    expect(cats.size).toBeGreaterThanOrEqual(8);
  });
});

describe("product → post linking", () => {
  const productId = "abo-b07pdyw6vm";
  const otherId = manifest.products.map((p) => catalog.catalogProductId("abo", p.sourceItemId)).find((id) => id !== productId)!;

  it("O/K. no synthetic counts: a fresh product has zero questions", () => {
    expect(catalog.countQuestionsForProduct(productId)).toBe(0);
  });

  it("J. a real public Buy or Pass post linking the product counts; unlisted and demo posts never do", () => {
    const author = makeUser("cat");
    const base = { authorId: author.id, description: "d", priceCents: null, currency: null, categoryId: "audio", tags: [] };
    const real = createPost({ ...base, title: "Real linked", visibility: "public", catalogProductId: productId }, []);
    createPost({ ...base, title: "Unlisted linked", visibility: "unlisted", catalogProductId: productId }, []);
    const demoAuthor = createDemoUser(`demo${randomUUID().slice(0, 6)}@example.com`, `demo${randomUUID().slice(0, 6)}`, "x", "Demo");
    createPost({ ...base, authorId: demoAuthor.id, title: "Demo linked", visibility: "public", isDemo: true, catalogProductId: productId }, []);

    const qs = catalog.listQuestionsForProduct(productId);
    expect(qs.map((p) => p.id)).toEqual([real.id]);
    expect(catalog.countQuestionsForProduct(productId)).toBe(1);
    expect(real.catalogProductId).toBe(productId);
  });

  it("M. a Which One? post linking catalog products through its options counts for each option's product", () => {
    const author = makeUser("cmp");
    const post = createPost(
      { authorId: author.id, title: "Compare", description: "d", priceCents: null, currency: null, categoryId: "audio", tags: [], visibility: "public", mode: "WHICH_ONE" },
      [],
    );
    setPurchaseOptions(post.id, [
      { name: "A", imageId: null, expectedPriceCents: 1000, currency: "AUD", originalPriceCents: null, condition: null, sourceUrl: null, saleNote: null, catalogProductId: otherId },
      { name: "B (custom)", imageId: null, expectedPriceCents: 2000, currency: "AUD", originalPriceCents: null, condition: null, sourceUrl: null, saleNote: null },
    ]);
    expect(catalog.listQuestionsForProduct(otherId).map((p) => p.id)).toContain(post.id);
  });

  it("S. re-syncing the catalog never touches posts linked to it", () => {
    const posts = count(`SELECT COUNT(*) AS n FROM posts`);
    const linked = count(`SELECT COUNT(*) AS n FROM posts WHERE catalog_product_id IS NOT NULL`);
    catalog.syncCatalog(manifest);
    expect(count(`SELECT COUNT(*) AS n FROM posts`)).toBe(posts);
    expect(count(`SELECT COUNT(*) AS n FROM posts WHERE catalog_product_id IS NOT NULL`)).toBe(linked);
  });
});
