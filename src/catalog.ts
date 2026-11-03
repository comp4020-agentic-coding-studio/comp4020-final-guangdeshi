// Real product catalog (migration 0008_product_catalog). Factual product
// records — name, brand, photo, known attributes — imported from a licensed
// dataset, kept separate from user-created purchasing posts. A catalog
// product never carries a price, rating, review, stock status or "popular"
// signal: the only engagement shown anywhere is a live COUNT of real posts
// that link to it.
//
// Data flow: scripts/import-product-catalog.ts fetches approved source
// images, optimizes them into src/public/catalog/ and writes
// src/catalog-manifest.json. syncCatalogFromManifest() (called at server
// boot) upserts that manifest into the database idempotently, so every
// environment — local, CI's throwaway container, a future deploy — gets the
// same catalog with no network access and without ever touching user
// content.
import { randomUUID } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { db, rowToPost, type Post } from "./db.ts";

export const CATALOG_MANIFEST_PATH = fileURLToPath(new URL("./catalog-manifest.json", import.meta.url));

export interface CatalogImportSource {
  id: string;
  name: string;
  sourceUrl: string;
  license: string;
  licenseUrl: string;
  attribution: string;
  retrievedAt: string;
}

export interface CatalogProduct {
  id: string;
  sourceId: string;
  sourceItemId: string;
  sourceDomain: string;
  categoryId: string;
  name: string;
  originalTitle: string;
  brand: string | null;
  productType: string | null;
  keyAttribute: string | null;
  features: string[];
  importedAt: string;
  updatedAt: string;
}

export interface CatalogProductImage {
  id: string;
  productId: string;
  position: number;
  sourceImageId: string;
  sourceImageUrl: string;
  filePath: string; // public URL path, e.g. /static/catalog/<file>.jpg
  width: number;
  height: number;
  originalWidth: number;
  originalHeight: number;
}

export interface CatalogCard {
  product: CatalogProduct;
  image: CatalogProductImage | null;
  questionCount: number;
}

// ------------------------------------------------------------ manifest ---

export interface ManifestProduct {
  sourceItemId: string;
  sourceDomain: string;
  categoryId: string;
  name: string;
  originalTitle: string;
  brand: string | null;
  productType: string | null;
  keyAttribute: string | null;
  features: string[];
  attributes: Record<string, string>;
  image: {
    sourceImageId: string;
    sourceImageUrl: string;
    file: string; // filename under src/public/catalog/
    width: number;
    height: number;
    originalWidth: number;
    originalHeight: number;
  };
}

export interface CatalogManifest {
  source: CatalogImportSource;
  products: ManifestProduct[];
}

/** Deterministic, stable catalog id from (source, item), so re-imports update the same row and links from real posts never break. */
export function catalogProductId(sourceId: string, sourceItemId: string): string {
  return `${sourceId}-${sourceItemId}`.toLowerCase();
}

export interface SyncResult {
  inserted: number;
  updated: number;
  total: number;
}

/**
 * Upserts a manifest into the catalog tables in one transaction. Idempotent:
 * re-running with the same manifest changes nothing; a changed record is
 * updated in place under the same stable id. It never deletes a catalog
 * product (a real post may link to it) and never touches posts, opinions or
 * any user table.
 */
export function syncCatalog(manifest: CatalogManifest): SyncResult {
  const ts = new Date().toISOString();
  let inserted = 0;
  let updated = 0;
  db.exec("BEGIN");
  try {
    const s = manifest.source;
    db.prepare(
      `INSERT INTO catalog_import_sources (id, name, source_url, license, license_url, attribution, retrieved_at, imported_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET name = excluded.name, source_url = excluded.source_url, license = excluded.license,
         license_url = excluded.license_url, attribution = excluded.attribution, retrieved_at = excluded.retrieved_at`,
    ).run(s.id, s.name, s.sourceUrl, s.license, s.licenseUrl, s.attribution, s.retrievedAt, ts);

    const exists = db.prepare(`SELECT 1 FROM catalog_products WHERE id = ?`);
    const upsertProduct = db.prepare(
      `INSERT INTO catalog_products (id, source_id, source_item_id, source_domain, category_id, name, original_title, brand, product_type, key_attribute, features, imported_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET source_domain = excluded.source_domain, category_id = excluded.category_id, name = excluded.name,
         original_title = excluded.original_title, brand = excluded.brand, product_type = excluded.product_type,
         key_attribute = excluded.key_attribute, features = excluded.features, updated_at = excluded.updated_at`,
    );
    const deleteImages = db.prepare(`DELETE FROM catalog_product_images WHERE product_id = ?`);
    const insertImage = db.prepare(
      `INSERT INTO catalog_product_images (id, product_id, position, source_image_id, source_image_url, file_path, width, height, original_width, original_height)
       VALUES (?, ?, 0, ?, ?, ?, ?, ?, ?, ?)`,
    );
    const deleteAttrs = db.prepare(`DELETE FROM catalog_product_attributes WHERE product_id = ?`);
    const insertAttr = db.prepare(`INSERT INTO catalog_product_attributes (product_id, name, value) VALUES (?, ?, ?)`);

    for (const p of manifest.products) {
      const id = catalogProductId(s.id, p.sourceItemId);
      if (exists.get(id)) updated++;
      else inserted++;
      upsertProduct.run(id, s.id, p.sourceItemId, p.sourceDomain, p.categoryId, p.name, p.originalTitle, p.brand, p.productType, p.keyAttribute, JSON.stringify(p.features), ts, ts);
      deleteImages.run(id);
      const img = p.image;
      insertImage.run(randomUUID(), id, img.sourceImageId, img.sourceImageUrl, `/static/catalog/${img.file}`, img.width, img.height, img.originalWidth, img.originalHeight);
      deleteAttrs.run(id);
      for (const [name, value] of Object.entries(p.attributes)) insertAttr.run(id, name, value);
    }
    db.exec("COMMIT");
  } catch (err) {
    db.exec("ROLLBACK");
    throw err;
  }
  return { inserted, updated, total: manifest.products.length };
}

export function syncCatalogFromManifest(path = CATALOG_MANIFEST_PATH): SyncResult | null {
  if (!existsSync(path)) return null;
  return syncCatalog(JSON.parse(readFileSync(path, "utf8")) as CatalogManifest);
}

// ------------------------------------------------------------- queries ---

function rowToProduct(row: any): CatalogProduct {
  return {
    id: row.id,
    sourceId: row.source_id,
    sourceItemId: row.source_item_id,
    sourceDomain: row.source_domain,
    categoryId: row.category_id,
    name: row.name,
    originalTitle: row.original_title,
    brand: row.brand,
    productType: row.product_type,
    keyAttribute: row.key_attribute,
    features: JSON.parse(row.features),
    importedAt: row.imported_at,
    updatedAt: row.updated_at,
  };
}

function rowToImage(row: any): CatalogProductImage {
  return {
    id: row.id,
    productId: row.product_id,
    position: row.position,
    sourceImageId: row.source_image_id,
    sourceImageUrl: row.source_image_url,
    filePath: row.file_path,
    width: row.width,
    height: row.height,
    originalWidth: row.original_width,
    originalHeight: row.original_height,
  };
}

export function getCatalogProduct(id: string): CatalogProduct | undefined {
  const row = db.prepare(`SELECT * FROM catalog_products WHERE id = ?`).get(id);
  return row ? rowToProduct(row) : undefined;
}

export function getCatalogProducts(ids: string[]): CatalogProduct[] {
  if (ids.length === 0) return [];
  const rows = db.prepare(`SELECT * FROM catalog_products WHERE id IN (${ids.map(() => "?").join(",")})`).all(...ids) as any[];
  const byId = new Map(rows.map((r) => [r.id, rowToProduct(r)]));
  return ids.map((id) => byId.get(id)).filter((p): p is CatalogProduct => !!p);
}

export function getCatalogProductImage(productId: string): CatalogProductImage | null {
  const row = db.prepare(`SELECT * FROM catalog_product_images WHERE product_id = ? ORDER BY position LIMIT 1`).get(productId);
  return row ? rowToImage(row) : null;
}

export function getCatalogProductAttributes(productId: string): { name: string; value: string }[] {
  return db.prepare(`SELECT name, value FROM catalog_product_attributes WHERE product_id = ? ORDER BY name`).all(productId) as any[];
}

export function getCatalogSource(id: string): CatalogImportSource | undefined {
  const row = db.prepare(`SELECT * FROM catalog_import_sources WHERE id = ?`).get(id) as any;
  if (!row) return undefined;
  return {
    id: row.id,
    name: row.name,
    sourceUrl: row.source_url,
    license: row.license,
    licenseUrl: row.license_url,
    attribution: row.attribution,
    retrievedAt: row.retrieved_at,
  };
}

export function listCatalogSources(): CatalogImportSource[] {
  return (db.prepare(`SELECT id FROM catalog_import_sources ORDER BY name`).all() as any[]).map((r) => getCatalogSource(r.id)!);
}

/**
 * Real public, active, non-demo posts that link to a catalog product —
 * either directly (a Buy or Pass question about it) or through one of a
 * Which One? post's options. Unlisted posts never appear (same rule as the
 * feed), and demo posts never count as genuine community questions.
 */
const QUESTIONS_FOR_PRODUCT_SQL = `
  SELECT p.* FROM posts p
  WHERE p.status = 'active' AND p.visibility = 'public' AND p.is_demo = 0
    AND (p.catalog_product_id = ?
         OR p.id IN (SELECT post_id FROM purchase_options WHERE catalog_product_id = ?))
  ORDER BY p.created_at DESC, p.id DESC`;

export function listQuestionsForProduct(productId: string, limit = 20): Post[] {
  return (db.prepare(`${QUESTIONS_FOR_PRODUCT_SQL} LIMIT ?`).all(productId, productId, limit) as any[]).map(rowToPost);
}

export function countQuestionsForProduct(productId: string): number {
  return (db.prepare(`SELECT COUNT(*) AS n FROM (${QUESTIONS_FOR_PRODUCT_SQL})`).get(productId, productId) as any).n;
}

export interface CatalogQuery {
  categoryId?: string;
  search?: string;
  page?: number;
  pageSize?: number;
}

export interface CatalogPage {
  cards: CatalogCard[];
  page: number;
  totalPages: number;
  total: number;
}

/**
 * Catalog browsing. Ordered by a fixed key (per-category rank, category sort
 * order, name, id) so the order is stable and pagination never duplicates or
 * skips a product — there is no popularity ranking to fabricate. Offset paging is
 * fine here: the catalog is small, curated and changes only on re-import.
 */
export function listCatalog(query: CatalogQuery = {}): CatalogPage {
  const pageSize = Math.min(Math.max(query.pageSize ?? 24, 1), 60);
  const clauses: string[] = [];
  const params: any[] = [];
  if (query.categoryId) {
    clauses.push("cp.category_id = ?");
    params.push(query.categoryId);
  }
  if (query.search) {
    const like = `%${query.search.replace(/[%_\\]/g, "\\$&")}%`;
    clauses.push(`(cp.name LIKE ? ESCAPE '\\' OR cp.original_title LIKE ? ESCAPE '\\' OR cp.brand LIKE ? ESCAPE '\\' OR cp.product_type LIKE ? ESCAPE '\\')`);
    params.push(like, like, like, like);
  }
  const where = clauses.length ? `WHERE ${clauses.join(" AND ")}` : "";
  const total = (db.prepare(`SELECT COUNT(*) AS n FROM catalog_products cp ${where}`).get(...params) as any).n as number;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const page = Math.min(Math.max(query.page ?? 1, 1), totalPages);
  // Interleave categories (1st of each category, then 2nd of each, …) so an
  // unfiltered first page shows the catalog's breadth rather than a page of
  // one category. Still a fixed, data-independent key — no popularity input.
  const rows = db
    .prepare(
      `SELECT * FROM (
         SELECT cp.*, c.sort_order AS cat_order,
                ROW_NUMBER() OVER (PARTITION BY cp.category_id ORDER BY cp.name, cp.id) AS cat_rank
         FROM catalog_products cp JOIN categories c ON c.id = cp.category_id ${where}
       ) ORDER BY cat_rank, cat_order, name, id LIMIT ? OFFSET ?`,
    )
    .all(...params, pageSize, (page - 1) * pageSize) as any[];
  const cards = rows.map((r) => {
    const product = rowToProduct(r);
    return { product, image: getCatalogProductImage(product.id), questionCount: countQuestionsForProduct(product.id) };
  });
  return { cards, page, totalPages, total };
}

export function catalogCategoryCounts(): Record<string, number> {
  const rows = db.prepare(`SELECT category_id, COUNT(*) AS n FROM catalog_products GROUP BY category_id`).all() as any[];
  return Object.fromEntries(rows.map((r) => [r.category_id, r.n]));
}
