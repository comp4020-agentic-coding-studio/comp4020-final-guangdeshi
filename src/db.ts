// Persistence layer. Uses node:sqlite (built into Node 24) against a single
// file on the Fly volume, mirroring the course's single server / single
// datastore constraint. All access in this process is synchronous: every
// exported function here runs to completion as one JS tick, so two
// "simultaneous" HTTP requests in this single Node process can never
// interleave mid-write — that's what makes the opinions UPSERT below
// race-free without any extra locking.
import { DatabaseSync } from "node:sqlite";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { randomUUID } from "node:crypto";
import { runMigrations } from "./migrations.ts";

// Defaults to a path relative to the working directory, since /data isn't
// writable locally without root and vitest's own process (spec/unit.test.ts
// imports this module directly, outside any running server) needs a usable
// default with no env vars set. fly.toml's [env] and the CI workflow's
// docker run both set DATABASE_PATH explicitly to the real volume mount
// (/data/buyorpass.sqlite) — this default is never what production uses.
const DB_PATH = process.env.DATABASE_PATH ?? "./data/buyorpass.sqlite";
mkdirSync(dirname(DB_PATH), { recursive: true });

export const db = new DatabaseSync(DB_PATH);
db.exec("PRAGMA journal_mode = WAL;");
db.exec("PRAGMA foreign_keys = ON;");
db.exec("PRAGMA busy_timeout = 5000;");
runMigrations(db);

const now = () => new Date().toISOString();

// ---------------------------------------------------------------- users ---

export interface User {
  id: string;
  email: string;
  handle: string;
  passwordHash: string;
  displayName: string;
  bio: string;
  avatarImageId: string | null;
  isAdmin: boolean;
  isDemo: boolean;
  createdAt: string;
  updatedAt: string;
}

function rowToUser(row: any): User {
  return {
    id: row.id,
    email: row.email,
    handle: row.handle,
    passwordHash: row.password_hash,
    displayName: row.display_name,
    bio: row.bio,
    avatarImageId: row.avatar_image_id,
    isAdmin: !!row.is_admin,
    isDemo: !!row.is_demo,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function createUser(email: string, handle: string, passwordHash: string, displayName: string): User {
  const id = randomUUID();
  const ts = now();
  db.prepare(
    `INSERT INTO users (id, email, handle, password_hash, display_name, bio, avatar_image_id, is_admin, is_demo, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, '', NULL, 0, 0, ?, ?)`,
  ).run(id, email, handle, passwordHash, displayName, ts, ts);
  return getUserById(id)!;
}

// Demo seeding only (scripts/seed-demo-content.ts) — same insert as
// createUser plus is_demo=1, so every other read path treats a demo account
// exactly like a real one except where a query explicitly filters on
// is_demo (activityStats, the real-participation admin counts).
export function createDemoUser(email: string, handle: string, passwordHash: string, displayName: string): User {
  const id = randomUUID();
  const ts = now();
  db.prepare(
    `INSERT INTO users (id, email, handle, password_hash, display_name, bio, avatar_image_id, is_admin, is_demo, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, '', NULL, 0, 1, ?, ?)`,
  ).run(id, email, handle, passwordHash, displayName, ts, ts);
  return getUserById(id)!;
}

export function getUserById(id: string): User | undefined {
  const row = db.prepare(`SELECT * FROM users WHERE id = ?`).get(id);
  return row ? rowToUser(row) : undefined;
}

export function getUserByEmail(email: string): User | undefined {
  const row = db.prepare(`SELECT * FROM users WHERE email = ?`).get(email.toLowerCase());
  return row ? rowToUser(row) : undefined;
}

export function getUserByHandle(handle: string): User | undefined {
  const row = db.prepare(`SELECT * FROM users WHERE handle = ?`).get(handle.toLowerCase());
  return row ? rowToUser(row) : undefined;
}

export function anyAdminExists(): boolean {
  const row = db.prepare(`SELECT 1 FROM users WHERE is_admin = 1 LIMIT 1`).get();
  return !!row;
}

export function promoteToAdmin(userId: string): void {
  db.prepare(`UPDATE users SET is_admin = 1, updated_at = ? WHERE id = ?`).run(now(), userId);
}

export interface ProfileUpdate {
  displayName?: string;
  bio?: string;
  avatarImageId?: string | null;
}

export function updateUserProfile(id: string, update: ProfileUpdate): User {
  const current = getUserById(id);
  if (!current) throw new Error("user not found");
  db.prepare(
    `UPDATE users SET display_name = ?, bio = ?, avatar_image_id = ?, updated_at = ? WHERE id = ?`,
  ).run(
    update.displayName ?? current.displayName,
    update.bio ?? current.bio,
    update.avatarImageId !== undefined ? update.avatarImageId : current.avatarImageId,
    now(),
    id,
  );
  return getUserById(id)!;
}

export function updateUserPassword(id: string, passwordHash: string): void {
  db.prepare(`UPDATE users SET password_hash = ?, updated_at = ? WHERE id = ?`).run(passwordHash, now(), id);
}

// ----------------------------------------------------------- sessions -----

export interface SessionRow {
  tokenHash: string;
  userId: string;
  csrfSecret: string;
  createdAt: string;
  expiresAt: string;
  lastSeenAt: string;
}

export function createSessionRow(tokenHash: string, userId: string, csrfSecret: string, expiresAt: string): void {
  const ts = now();
  db.prepare(
    `INSERT INTO sessions (token_hash, user_id, csrf_secret, created_at, expires_at, last_seen_at)
     VALUES (?, ?, ?, ?, ?, ?)`,
  ).run(tokenHash, userId, csrfSecret, ts, expiresAt, ts);
}

export function getSessionByTokenHash(tokenHash: string): SessionRow | undefined {
  const row = db.prepare(`SELECT * FROM sessions WHERE token_hash = ?`).get(tokenHash);
  if (!row) return undefined;
  return {
    tokenHash: (row as any).token_hash,
    userId: (row as any).user_id,
    csrfSecret: (row as any).csrf_secret,
    createdAt: (row as any).created_at,
    expiresAt: (row as any).expires_at,
    lastSeenAt: (row as any).last_seen_at,
  };
}

export function touchSession(tokenHash: string): void {
  db.prepare(`UPDATE sessions SET last_seen_at = ? WHERE token_hash = ?`).run(now(), tokenHash);
}

export function deleteSession(tokenHash: string): void {
  db.prepare(`DELETE FROM sessions WHERE token_hash = ?`).run(tokenHash);
}

export function deleteExpiredSessions(): number {
  const result = db.prepare(`DELETE FROM sessions WHERE expires_at < ?`).run(now());
  return Number(result.changes);
}

// --------------------------------------------------------- categories -----

export interface Category {
  id: string;
  name: string;
  description: string;
  sortOrder: number;
}

export function listCategories(): Category[] {
  return (db.prepare(`SELECT * FROM categories ORDER BY sort_order ASC`).all() as any[]).map((r) => ({
    id: r.id,
    name: r.name,
    description: r.description,
    sortOrder: r.sort_order,
  }));
}

export function getCategoryById(id: string): Category | undefined {
  const row = db.prepare(`SELECT * FROM categories WHERE id = ?`).get(id) as any;
  return row ? { id: row.id, name: row.name, description: row.description, sortOrder: row.sort_order } : undefined;
}

export function getUserInterests(userId: string): string[] {
  return (db.prepare(`SELECT category_id FROM user_interests WHERE user_id = ?`).all(userId) as any[]).map(
    (r) => r.category_id,
  );
}

export function setUserInterests(userId: string, categoryIds: string[]): void {
  db.exec("BEGIN");
  try {
    db.prepare(`DELETE FROM user_interests WHERE user_id = ?`).run(userId);
    const ts = now();
    const insert = db.prepare(`INSERT INTO user_interests (user_id, category_id, created_at) VALUES (?, ?, ?)`);
    for (const categoryId of categoryIds) insert.run(userId, categoryId, ts);
    db.exec("COMMIT");
  } catch (err) {
    db.exec("ROLLBACK");
    throw err;
  }
}

// -------------------------------------------------------------- images ----

export interface ImageRow {
  id: string;
  ownerUserId: string;
  filename: string;
  mimeType: string;
  width: number;
  height: number;
  byteSize: number;
  createdAt: string;
}

export function createImageRow(
  ownerUserId: string,
  filename: string,
  mimeType: string,
  width: number,
  height: number,
  byteSize: number,
): ImageRow {
  const id = randomUUID();
  const ts = now();
  db.prepare(
    `INSERT INTO images (id, owner_user_id, filename, mime_type, width, height, byte_size, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(id, ownerUserId, filename, mimeType, width, height, byteSize, ts);
  return getImageById(id)!;
}

export function getImageById(id: string): ImageRow | undefined {
  const row = db.prepare(`SELECT * FROM images WHERE id = ?`).get(id) as any;
  if (!row) return undefined;
  return {
    id: row.id,
    ownerUserId: row.owner_user_id,
    filename: row.filename,
    mimeType: row.mime_type,
    width: row.width,
    height: row.height,
    byteSize: row.byte_size,
    createdAt: row.created_at,
  };
}

// --------------------------------------------------------------- posts ----

export type PostMode = "BUY_PASS" | "WHICH_ONE";

export interface Post {
  id: string;
  authorId: string;
  title: string;
  description: string;
  priceCents: number | null;
  currency: string | null;
  categoryId: string;
  tags: string[];
  visibility: "public" | "unlisted";
  status: "active" | "deleted";
  mode: PostMode;
  isDemo: boolean;
  createdAt: string;
  updatedAt: string;
}

export function rowToPost(row: any): Post {
  return {
    id: row.id,
    authorId: row.author_id,
    title: row.title,
    description: row.description,
    priceCents: row.price_cents,
    currency: row.currency,
    categoryId: row.category_id,
    tags: JSON.parse(row.tags),
    visibility: row.visibility,
    status: row.status,
    mode: row.post_mode,
    isDemo: !!row.is_demo,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export interface NewPost {
  authorId: string;
  title: string;
  description: string;
  priceCents: number | null;
  currency: string | null;
  categoryId: string;
  tags: string[];
  visibility: "public" | "unlisted";
  mode?: PostMode; // defaults to BUY_PASS — the only mode that existed pre-v2
  isDemo?: boolean; // defaults to false; only scripts/seed-demo-content.ts ever passes true
}

export function createPost(input: NewPost, imageIds: string[]): Post {
  const id = randomUUID();
  const ts = now();
  db.exec("BEGIN");
  try {
    db.prepare(
      `INSERT INTO posts (id, author_id, title, description, price_cents, currency, category_id, tags, visibility, status, post_mode, is_demo, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'active', ?, ?, ?, ?)`,
    ).run(
      id,
      input.authorId,
      input.title,
      input.description,
      input.priceCents,
      input.currency,
      input.categoryId,
      JSON.stringify(input.tags),
      input.visibility,
      input.mode ?? "BUY_PASS",
      input.isDemo ? 1 : 0,
      ts,
      ts,
    );
    const attach = db.prepare(`INSERT INTO post_images (post_id, image_id, position) VALUES (?, ?, ?)`);
    imageIds.forEach((imageId, index) => attach.run(id, imageId, index));
    db.exec("COMMIT");
  } catch (err) {
    db.exec("ROLLBACK");
    throw err;
  }
  return getPostById(id)!;
}

export interface PostUpdate {
  title?: string;
  description?: string;
  priceCents?: number | null;
  currency?: string | null;
  categoryId?: string;
  tags?: string[];
  visibility?: "public" | "unlisted";
}

export function updatePost(id: string, update: PostUpdate, imageIds?: string[]): Post {
  const current = getPostById(id);
  if (!current) throw new Error("post not found");
  db.exec("BEGIN");
  try {
    db.prepare(
      `UPDATE posts SET title = ?, description = ?, price_cents = ?, currency = ?, category_id = ?, tags = ?, visibility = ?, updated_at = ?
       WHERE id = ?`,
    ).run(
      update.title ?? current.title,
      update.description ?? current.description,
      update.priceCents !== undefined ? update.priceCents : current.priceCents,
      update.currency !== undefined ? update.currency : current.currency,
      update.categoryId ?? current.categoryId,
      JSON.stringify(update.tags ?? current.tags),
      update.visibility ?? current.visibility,
      now(),
      id,
    );
    if (imageIds) {
      db.prepare(`DELETE FROM post_images WHERE post_id = ?`).run(id);
      const attach = db.prepare(`INSERT INTO post_images (post_id, image_id, position) VALUES (?, ?, ?)`);
      imageIds.forEach((imageId, index) => attach.run(id, imageId, index));
    }
    db.exec("COMMIT");
  } catch (err) {
    db.exec("ROLLBACK");
    throw err;
  }
  return getPostById(id)!;
}

export function softDeletePost(id: string): void {
  db.prepare(`UPDATE posts SET status = 'deleted', updated_at = ? WHERE id = ?`).run(now(), id);
}

export function getPostById(id: string): Post | undefined {
  const row = db.prepare(`SELECT * FROM posts WHERE id = ?`).get(id);
  return row ? rowToPost(row) : undefined;
}

export function getPostImageIds(postId: string): string[] {
  return (
    db.prepare(`SELECT image_id FROM post_images WHERE post_id = ? ORDER BY position ASC`).all(postId) as any[]
  ).map((r) => r.image_id);
}

export interface FeedQuery {
  categoryId?: string;
  search?: string;
  cursor?: string; // `${created_at}|${id}` of the last item on the previous page
  limit?: number;
}

export interface FeedPage {
  posts: Post[];
  nextCursor: string | null;
}

export function listFeed(query: FeedQuery): FeedPage {
  const limit = Math.min(Math.max(query.limit ?? 20, 1), 50);
  // Demo content lives in its own /discover/demo feed (getDemoFeed below),
  // never mixed into the real Discover feed — a visitor should never
  // mistake a fictional scenario for genuine community activity.
  const clauses = ["status = 'active'", "visibility = 'public'", "is_demo = 0"];
  const params: any[] = [];

  if (query.categoryId) {
    clauses.push("category_id = ?");
    params.push(query.categoryId);
  }
  if (query.search) {
    clauses.push("(title LIKE ? OR description LIKE ?)");
    const like = `%${query.search.replace(/[%_]/g, "\\$&")}%`;
    params.push(like, like);
  }
  if (query.cursor) {
    const [createdAt, id] = query.cursor.split("|");
    clauses.push("(created_at < ? OR (created_at = ? AND id < ?))");
    params.push(createdAt, createdAt, id);
  }

  const sql = `SELECT * FROM posts WHERE ${clauses.join(" AND ")} ORDER BY created_at DESC, id DESC LIMIT ?`;
  params.push(limit + 1);
  const rows = db.prepare(sql).all(...params) as any[];
  const hasMore = rows.length > limit;
  const page = rows.slice(0, limit).map(rowToPost);
  const last = page[page.length - 1];
  return { posts: page, nextCursor: hasMore && last ? `${last.createdAt}|${last.id}` : null };
}

/**
 * "Popular / actively discussed" view (brief's Discover requirement):
 * public active posts ordered by total opinion count, most-discussed first.
 * Deliberately a single bounded page (no cursor pagination) rather than the
 * full keyset-paginated feed listFeed() provides — "most discussed" is a
 * highlights view, not something users are expected to page deeply through;
 * documented as a known scope limit rather than silently assumed away.
 */
export function listMostDiscussed(limit = 20): (Post & { opinionCount: number })[] {
  const rows = db
    .prepare(
      `SELECT p.*, COUNT(o.id) AS opinion_count
       FROM posts p LEFT JOIN opinions o ON o.post_id = p.id
       WHERE p.status = 'active' AND p.visibility = 'public' AND p.is_demo = 0
       GROUP BY p.id
       ORDER BY opinion_count DESC, p.created_at DESC
       LIMIT ?`,
    )
    .all(limit) as any[];
  return rows.map((row) => ({ ...rowToPost(row), opinionCount: row.opinion_count }));
}

/**
 * Feature D's dedicated demo feed (brief: "a clearly labelled 'Explore
 * Demo' section," never mixed into real Discover). Readable by anyone,
 * logged in or not. Bounded, single page — a showcase of 18-24 scenarios
 * never needs real pagination.
 */
export function getDemoFeed(limit = 30): Post[] {
  const rows = db
    .prepare(
      `SELECT * FROM posts WHERE status = 'active' AND visibility = 'public' AND is_demo = 1
       ORDER BY created_at DESC LIMIT ?`,
    )
    .all(limit) as any[];
  return rows.map(rowToPost);
}

export function listPostsByAuthor(authorId: string, includeUnlisted: boolean): Post[] {
  const clauses = ["author_id = ?", "status = 'active'"];
  const params: any[] = [authorId];
  if (!includeUnlisted) clauses.push("visibility = 'public'");
  const rows = db
    .prepare(`SELECT * FROM posts WHERE ${clauses.join(" AND ")} ORDER BY created_at DESC`)
    .all(...params) as any[];
  return rows.map(rowToPost);
}

// ------------------------------------------------------- post search -----
// Feature C: SQLite FTS5 over title/description/context, explicitly synced
// from application code on every post create/edit (never a SQL trigger) so
// a missed sync is a visible bug in a reviewable function, not implicit
// database magic. This is keyword relevance via bm25() ranking — not a
// learned/semantic model; see docs/research/RECOMMENDATION_ROADMAP.md.

export function indexPostForSearch(postId: string, title: string, description: string, contextText: string): void {
  db.prepare(`DELETE FROM posts_search WHERE post_id = ?`).run(postId);
  db.prepare(`INSERT INTO posts_search (post_id, title, description, context_text) VALUES (?, ?, ?, ?)`).run(
    postId,
    title,
    description,
    contextText,
  );
}

export function removePostFromSearchIndex(postId: string): void {
  db.prepare(`DELETE FROM posts_search WHERE post_id = ?`).run(postId);
}

export interface SearchResult {
  post: Post;
  rank: number;
}

/**
 * FTS5 MATCH requires its query string to be free of characters FTS5's
 * query syntax treats specially (", *, (, ), AND/OR/NOT as bare tokens)
 * when the caller's input is just a post title or free text, not a
 * deliberately-constructed FTS query — so this quotes each word as an FTS5
 * string literal and ORs them together, which degrades gracefully to "match
 * any word" rather than throwing a syntax error on punctuation a real post
 * title might contain (e.g. "M4 Pro (2024)").
 */
function toFtsQuery(raw: string): string | null {
  const words = raw
    .split(/\s+/)
    .map((w) => w.replace(/[^\p{L}\p{N}]/gu, ""))
    .filter((w) => w.length > 0)
    .slice(0, 12);
  if (words.length === 0) return null;
  return words.map((w) => `"${w}"`).join(" OR ");
}

export function searchPosts(
  query: string,
  opts: { categoryId?: string; excludePostId?: string; limit?: number; includeDemoOnly?: boolean } = {},
): SearchResult[] {
  const ftsQuery = toFtsQuery(query);
  if (!ftsQuery) return [];
  const limit = Math.min(Math.max(opts.limit ?? 10, 1), 30);

  const clauses = ["p.status = 'active'", "p.visibility = 'public'"];
  const params: any[] = [ftsQuery];
  if (opts.includeDemoOnly) {
    clauses.push("p.is_demo = 1");
  } else {
    clauses.push("p.is_demo = 0");
  }
  if (opts.categoryId) {
    clauses.push("p.category_id = ?");
    params.push(opts.categoryId);
  }
  if (opts.excludePostId) {
    clauses.push("p.id != ?");
    params.push(opts.excludePostId);
  }
  params.push(limit);

  const rows = db
    .prepare(
      `SELECT p.*, bm25(posts_search) AS rank
       FROM posts_search
       JOIN posts p ON p.id = posts_search.post_id
       WHERE posts_search MATCH ? AND ${clauses.join(" AND ")}
       ORDER BY rank LIMIT ?`,
    )
    .all(...params) as any[];
  return rows.map((row) => ({ post: rowToPost(row), rank: row.rank }));
}

// ----------------------------------------------------- purchase options ---
// The 2-4 candidate products on a WHICH_ONE post (brief §7/§8). Always
// created once, atomically, alongside the post — a post's option list is
// never edited incrementally (add one, remove one); editing a WHICH_ONE
// post replaces the whole option set in one transaction, the same pattern
// createPost/updatePost already use for post_images.

export interface PurchaseOption {
  id: string;
  postId: string;
  position: number;
  name: string;
  imageId: string | null;
  expectedPriceCents: number;
  currency: string;
  originalPriceCents: number | null;
  condition: string | null;
  sourceUrl: string | null;
  saleNote: string | null;
  specifications: Record<string, string> | null;
  createdAt: string;
}

function rowToPurchaseOption(row: any): PurchaseOption {
  return {
    id: row.id,
    postId: row.post_id,
    position: row.position,
    name: row.name,
    imageId: row.image_id,
    expectedPriceCents: row.expected_price_cents,
    currency: row.currency,
    originalPriceCents: row.original_price_cents,
    condition: row.condition,
    sourceUrl: row.source_url,
    saleNote: row.sale_note,
    specifications: row.specifications ? JSON.parse(row.specifications) : null,
    createdAt: row.created_at,
  };
}

export interface NewPurchaseOption {
  name: string;
  imageId: string | null;
  expectedPriceCents: number;
  currency: string;
  originalPriceCents?: number | null;
  condition?: string | null;
  sourceUrl?: string | null;
  saleNote?: string | null;
  specifications?: Record<string, string> | null;
}

/**
 * Replaces a post's full option list atomically (brief: options are created
 * once at post-creation and whole-replaced on edit, never patched one at a
 * time). The 2-4 count bound is enforced by the caller (src/server.ts),
 * which can produce a user-facing validation error; the DB layer only
 * enforces position in [0,3] via CHECK, since that's a structural guarantee
 * regardless of caller.
 */
export function setPurchaseOptions(postId: string, options: NewPurchaseOption[]): PurchaseOption[] {
  db.exec("BEGIN");
  try {
    db.prepare(`DELETE FROM purchase_options WHERE post_id = ?`).run(postId);
    const ts = now();
    const insert = db.prepare(
      `INSERT INTO purchase_options (id, post_id, position, name, image_id, expected_price_cents, currency, original_price_cents, condition, source_url, sale_note, specifications, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    );
    options.forEach((opt, index) => {
      insert.run(
        randomUUID(),
        postId,
        index,
        opt.name,
        opt.imageId,
        opt.expectedPriceCents,
        opt.currency,
        opt.originalPriceCents ?? null,
        opt.condition ?? null,
        opt.sourceUrl ?? null,
        opt.saleNote ?? null,
        opt.specifications ? JSON.stringify(opt.specifications) : null,
        ts,
      );
    });
    db.exec("COMMIT");
  } catch (err) {
    db.exec("ROLLBACK");
    throw err;
  }
  return getPurchaseOptionsForPost(postId);
}

export function getPurchaseOptionsForPost(postId: string): PurchaseOption[] {
  return (
    db.prepare(`SELECT * FROM purchase_options WHERE post_id = ? ORDER BY position ASC`).all(postId) as any[]
  ).map(rowToPurchaseOption);
}

export function getPurchaseOptionById(id: string): PurchaseOption | undefined {
  const row = db.prepare(`SELECT * FROM purchase_options WHERE id = ?`).get(id);
  return row ? rowToPurchaseOption(row) : undefined;
}

// ---------------------------------------------------------- post context --
// Feature A: up to 3 optional, category-specific answers plus one free-text
// field (src/context-prompts.ts holds the actual prompt config). A post with
// no context answered has no row here at all — "don't render blank cards"
// is true by construction, not a template-side filter over empty strings.

export interface PostContext {
  postId: string;
  schemaVersion: number;
  categoryKey: string;
  answers: Record<string, string>;
  freeText: string;
  updatedAt: string;
}

function rowToPostContext(row: any): PostContext {
  return {
    postId: row.post_id,
    schemaVersion: row.schema_version,
    categoryKey: row.category_key,
    answers: JSON.parse(row.answers),
    freeText: row.free_text,
    updatedAt: row.updated_at,
  };
}

export function setPostContext(
  postId: string,
  schemaVersion: number,
  categoryKey: string,
  answers: Record<string, string>,
  freeText: string,
): PostContext {
  const ts = now();
  db.prepare(
    `INSERT INTO post_context (post_id, schema_version, category_key, answers, free_text, updated_at)
     VALUES (?, ?, ?, ?, ?, ?)
     ON CONFLICT(post_id) DO UPDATE SET schema_version = excluded.schema_version, category_key = excluded.category_key, answers = excluded.answers, free_text = excluded.free_text, updated_at = excluded.updated_at`,
  ).run(postId, schemaVersion, categoryKey, JSON.stringify(answers), freeText, ts);
  return getPostContext(postId)!;
}

export function getPostContext(postId: string): PostContext | undefined {
  const row = db.prepare(`SELECT * FROM post_context WHERE post_id = ?`).get(postId);
  return row ? rowToPostContext(row) : undefined;
}

export function deletePostContext(postId: string): void {
  db.prepare(`DELETE FROM post_context WHERE post_id = ?`).run(postId);
}

// ------------------------------------------------------------ opinions ----

export type Stance = "BUY" | "PASS";

// An opinion is exactly one of three shapes (enforced by the opinions CHECK
// constraint in migration 0004): a BUY_PASS stance, a selected comparison
// option, or an explicit "none of these" — never a mix, never all-null.
// stance/selectedOptionId/selectedNone are all present on every Opinion
// object so existing code reading `.stance` on a BUY_PASS opinion keeps
// working unchanged; the two new fields are simply null/false for every
// pre-v2 opinion row.
export interface Opinion {
  id: string;
  postId: string;
  userId: string;
  stance: Stance | null;
  selectedOptionId: string | null;
  selectedNone: boolean;
  comment: string;
  createdAt: string;
  updatedAt: string;
}

function rowToOpinion(row: any): Opinion {
  return {
    id: row.id,
    postId: row.post_id,
    userId: row.user_id,
    stance: row.stance,
    selectedOptionId: row.selected_option_id,
    selectedNone: !!row.selected_none,
    comment: row.comment,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

/**
 * Create-or-update a user's BUY_PASS opinion on a post in one atomic
 * statement. This is the mechanism that satisfies "one current opinion per
 * (post_id, user_id)" and "don't double-count concurrent submissions": the
 * uniqueness is a real database constraint (not just an application check),
 * and the whole read-modify-write is a single prepared-statement execution,
 * so two racing requests for the same (post, user) can't both "win" and
 * create two rows — the second one simply updates the first. Unchanged
 * since before v2 — every existing BUY_PASS call site and test keeps
 * working verbatim. selected_option_id/selected_none are explicitly reset
 * to their "unused" values on every call, so flipping a post from
 * comparison back to BUY_PASS (not a supported UI flow, but defensively)
 * could never leave a stale selection behind.
 */
export function upsertOpinion(postId: string, userId: string, stance: Stance, comment: string): Opinion {
  const id = randomUUID();
  const ts = now();
  db.prepare(
    `INSERT INTO opinions (id, post_id, user_id, stance, selected_option_id, selected_none, comment, created_at, updated_at)
     VALUES (?, ?, ?, ?, NULL, 0, ?, ?, ?)
     ON CONFLICT(post_id, user_id) DO UPDATE SET stance = excluded.stance, selected_option_id = NULL, selected_none = 0, comment = excluded.comment, updated_at = excluded.updated_at`,
  ).run(id, postId, userId, stance, comment, ts, ts);
  return getOpinionByPostAndUser(postId, userId)!;
}

export type ComparisonSelection = { optionId: string } | { none: true };

/**
 * The WHICH_ONE-mode equivalent of upsertOpinion — same atomicity and
 * concurrency guarantee (a single INSERT...ON CONFLICT), same UNIQUE
 * (post_id, user_id) constraint. Validating that optionId actually belongs
 * to this post is the caller's job (src/server.ts), since that needs a
 * user-facing error message; the CHECK constraint is the structural
 * backstop that a row can never end up with both a stance and a selection.
 */
export function upsertComparisonOpinion(postId: string, userId: string, selection: ComparisonSelection, comment: string): Opinion {
  const id = randomUUID();
  const ts = now();
  const optionId = "optionId" in selection ? selection.optionId : null;
  const isNone = "none" in selection && selection.none ? 1 : 0;
  db.prepare(
    `INSERT INTO opinions (id, post_id, user_id, stance, selected_option_id, selected_none, comment, created_at, updated_at)
     VALUES (?, ?, ?, NULL, ?, ?, ?, ?, ?)
     ON CONFLICT(post_id, user_id) DO UPDATE SET stance = NULL, selected_option_id = excluded.selected_option_id, selected_none = excluded.selected_none, comment = excluded.comment, updated_at = excluded.updated_at`,
  ).run(id, postId, userId, optionId, isNone, comment, ts, ts);
  return getOpinionByPostAndUser(postId, userId)!;
}

export function getOpinionByPostAndUser(postId: string, userId: string): Opinion | undefined {
  const row = db.prepare(`SELECT * FROM opinions WHERE post_id = ? AND user_id = ?`).get(postId, userId);
  return row ? rowToOpinion(row) : undefined;
}

export function getOpinionById(id: string): Opinion | undefined {
  const row = db.prepare(`SELECT * FROM opinions WHERE id = ?`).get(id);
  return row ? rowToOpinion(row) : undefined;
}

export interface OpinionWithAuthor extends Opinion {
  authorHandle: string;
  authorDisplayName: string;
  authorAvatarImageId: string | null;
}

export function listOpinionsForPost(postId: string): OpinionWithAuthor[] {
  const rows = db
    .prepare(
      `SELECT o.*, u.handle AS author_handle, u.display_name AS author_display_name, u.avatar_image_id AS author_avatar_image_id
       FROM opinions o JOIN users u ON u.id = o.user_id
       WHERE o.post_id = ? ORDER BY o.created_at DESC`,
    )
    .all(postId) as any[];
  return rows.map((r) => ({
    ...rowToOpinion(r),
    authorHandle: r.author_handle,
    authorDisplayName: r.author_display_name,
    authorAvatarImageId: r.author_avatar_image_id,
  }));
}

/**
 * Buy/Pass tallies only. The explicit `stance IS NOT NULL` guard means a
 * WHICH_ONE post's comparison selections (which always have stance=NULL)
 * can never be miscounted as Buy/Pass votes even if this were ever called
 * on the wrong post — the brief's explicit "comparison votes cannot be
 * counted as Buy/Pass votes" invariant, enforced at the query, not just by
 * callers routing correctly.
 */
export function getOpinionCounts(postId: string): { buy: number; pass: number } {
  const rows = db
    .prepare(`SELECT stance, COUNT(*) AS n FROM opinions WHERE post_id = ? AND stance IS NOT NULL GROUP BY stance`)
    .all(postId) as any[];
  const counts = { buy: 0, pass: 0 };
  for (const r of rows) {
    if (r.stance === "BUY") counts.buy = r.n;
    else counts.pass = r.n;
  }
  return counts;
}

/**
 * Per-option tallies for a WHICH_ONE post, plus a separate "none of these"
 * count. Every purchase_option is represented even with zero votes (LEFT
 * JOIN from purchase_options, not opinions), so a brand-new comparison post
 * shows all its options at 0 rather than omitting unvoted ones.
 */
export function getOptionCounts(postId: string): { counts: Record<string, number>; noneCount: number } {
  const optionRows = db
    .prepare(
      `SELECT po.id, COUNT(o.id) AS n
       FROM purchase_options po LEFT JOIN opinions o ON o.selected_option_id = po.id
       WHERE po.post_id = ? GROUP BY po.id`,
    )
    .all(postId) as any[];
  const counts: Record<string, number> = {};
  for (const r of optionRows) counts[r.id] = r.n;
  const noneCount = (
    db.prepare(`SELECT COUNT(*) AS n FROM opinions WHERE post_id = ? AND selected_none = 1`).get(postId) as any
  ).n;
  return { counts, noneCount };
}

export function deleteOpinion(postId: string, userId: string): boolean {
  const result = db.prepare(`DELETE FROM opinions WHERE post_id = ? AND user_id = ?`).run(postId, userId);
  return Number(result.changes) > 0;
}

export function listOpinionsByUser(userId: string): Opinion[] {
  return (
    db.prepare(`SELECT * FROM opinions WHERE user_id = ? ORDER BY created_at DESC`).all(userId) as any[]
  ).map(rowToOpinion);
}

// -------------------------------------------------------- post outcomes ---

export type OutcomeStatus = "BOUGHT" | "DID_NOT_BUY" | "STILL_DECIDING";

export interface PostOutcome {
  postId: string;
  status: OutcomeStatus;
  reflection: string;
  decidedAt: string;
  updatedAt: string;
  purchasedOptionId: string | null;
  influentialOpinionId: string | null;
}

function rowToOutcome(row: any): PostOutcome {
  return {
    postId: row.post_id,
    status: row.status,
    reflection: row.reflection,
    decidedAt: row.decided_at,
    updatedAt: row.updated_at,
    purchasedOptionId: row.purchased_option_id,
    influentialOpinionId: row.influential_opinion_id,
  };
}

/**
 * purchasedOptionId is preserved across repeat calls unless explicitly
 * passed (undefined means "don't touch it"), the same optional-update
 * convention used elsewhere in this file (see updatePost). influential_
 * opinion_id is intentionally NOT touched here — it has its own dedicated
 * setInfluentialOpinion function below, since marking/unmarking an
 * influential opinion is a separate user action from recording BOUGHT/
 * DID_NOT_BUY/STILL_DECIDING, and conflating them would mean re-saving the
 * outcome form could accidentally clear an unrelated marker.
 */
export function upsertOutcome(
  postId: string,
  status: OutcomeStatus,
  reflection: string,
  purchasedOptionId?: string | null,
): PostOutcome {
  const ts = now();
  const current = getOutcome(postId);
  const resolvedOptionId = purchasedOptionId !== undefined ? purchasedOptionId : (current?.purchasedOptionId ?? null);
  db.prepare(
    `INSERT INTO post_outcomes (post_id, status, reflection, decided_at, updated_at, purchased_option_id, influential_opinion_id)
     VALUES (?, ?, ?, ?, ?, ?, NULL)
     ON CONFLICT(post_id) DO UPDATE SET status = excluded.status, reflection = excluded.reflection, updated_at = excluded.updated_at, purchased_option_id = excluded.purchased_option_id`,
  ).run(postId, status, reflection, ts, ts, resolvedOptionId);
  return getOutcome(postId)!;
}

export function getOutcome(postId: string): PostOutcome | undefined {
  const row = db.prepare(`SELECT * FROM post_outcomes WHERE post_id = ?`).get(postId);
  return row ? rowToOutcome(row) : undefined;
}

/**
 * Feature E: the buyer's optional pointer at the single opinion they found
 * influential. A separate function (not folded into upsertOutcome) because
 * this can be set before any outcome row exists at all — the brief
 * explicitly says the buyer shouldn't be forced to record an outcome before
 * marking an influential comment. Creates a minimal STILL_DECIDING outcome
 * row on first use so the FK has something to attach to, exactly mirroring
 * how a fresh post with no outcome yet defaults to "still deciding" in the UI.
 */
export function setInfluentialOpinion(postId: string, opinionId: string | null): PostOutcome {
  const current = getOutcome(postId);
  const ts = now();
  if (!current) {
    db.prepare(
      `INSERT INTO post_outcomes (post_id, status, reflection, decided_at, updated_at, purchased_option_id, influential_opinion_id)
       VALUES (?, 'STILL_DECIDING', '', ?, ?, NULL, ?)`,
    ).run(postId, ts, ts, opinionId);
  } else {
    db.prepare(`UPDATE post_outcomes SET influential_opinion_id = ?, updated_at = ? WHERE post_id = ?`).run(opinionId, ts, postId);
  }
  return getOutcome(postId)!;
}

// ------------------------------------------------------------- reports ----

export interface Report {
  id: string;
  reporterId: string;
  targetType: "post" | "opinion";
  targetId: string;
  reason: string;
  status: "open" | "resolved" | "dismissed";
  createdAt: string;
  resolvedAt: string | null;
}

function rowToReport(row: any): Report {
  return {
    id: row.id,
    reporterId: row.reporter_id,
    targetType: row.target_type,
    targetId: row.target_id,
    reason: row.reason,
    status: row.status,
    createdAt: row.created_at,
    resolvedAt: row.resolved_at,
  };
}

export function createReport(reporterId: string, targetType: "post" | "opinion", targetId: string, reason: string): Report {
  const id = randomUUID();
  const ts = now();
  db.prepare(
    `INSERT INTO reports (id, reporter_id, target_type, target_id, reason, status, created_at, resolved_at)
     VALUES (?, ?, ?, ?, ?, 'open', ?, NULL)`,
  ).run(id, reporterId, targetType, targetId, reason, ts);
  return rowToReport(db.prepare(`SELECT * FROM reports WHERE id = ?`).get(id));
}

export function listReports(status?: "open" | "resolved" | "dismissed"): Report[] {
  const rows = status
    ? (db.prepare(`SELECT * FROM reports WHERE status = ? ORDER BY created_at DESC`).all(status) as any[])
    : (db.prepare(`SELECT * FROM reports ORDER BY created_at DESC`).all() as any[]);
  return rows.map(rowToReport);
}

export function resolveReport(id: string, resolution: "resolved" | "dismissed"): void {
  db.prepare(`UPDATE reports SET status = ?, resolved_at = ? WHERE id = ?`).run(resolution, now(), id);
}

// --------------------------------------------------------- activity log ---

export interface ActivityEvent {
  id: string;
  ts: string;
  requestId: string;
  userId: string | null;
  action: string;
  targetType: string | null;
  targetId: string | null;
  status: "success" | "failure";
  latencyMs: number | null;
  meta: Record<string, unknown>;
}

export function insertActivityEvent(event: Omit<ActivityEvent, "id" | "meta"> & { meta?: Record<string, unknown> }): void {
  const id = randomUUID();
  db.prepare(
    `INSERT INTO activity_events (id, ts, request_id, user_id, action, target_type, target_id, status, latency_ms, meta)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    id,
    event.ts,
    event.requestId,
    event.userId,
    event.action,
    event.targetType,
    event.targetId,
    event.status,
    event.latencyMs,
    JSON.stringify(event.meta ?? {}),
  );
}

function rowToActivityEvent(row: any): ActivityEvent {
  return {
    id: row.id,
    ts: row.ts,
    requestId: row.request_id,
    userId: row.user_id,
    action: row.action,
    targetType: row.target_type,
    targetId: row.target_id,
    status: row.status,
    latencyMs: row.latency_ms,
    meta: JSON.parse(row.meta),
  };
}

export function listRecentActivity(limit = 100): ActivityEvent[] {
  return (
    db.prepare(`SELECT * FROM activity_events ORDER BY ts DESC LIMIT ?`).all(limit) as any[]
  ).map(rowToActivityEvent);
}

export function activityStats(sinceIso: string): {
  activeUsers: number;
  totalEvents: number;
  failedEvents: number;
  byAction: { action: string; n: number }[];
} {
  const activeUsers = (
    db
      .prepare(`SELECT COUNT(DISTINCT user_id) AS n FROM activity_events WHERE ts >= ? AND user_id IS NOT NULL`)
      .get(sinceIso) as any
  ).n;
  const totalEvents = (db.prepare(`SELECT COUNT(*) AS n FROM activity_events WHERE ts >= ?`).get(sinceIso) as any).n;
  const failedEvents = (
    db.prepare(`SELECT COUNT(*) AS n FROM activity_events WHERE ts >= ? AND status = 'failure'`).get(sinceIso) as any
  ).n;
  const byAction = db
    .prepare(`SELECT action, COUNT(*) AS n FROM activity_events WHERE ts >= ? GROUP BY action ORDER BY n DESC`)
    .all(sinceIso) as any[];
  return { activeUsers, totalEvents, failedEvents, byAction };
}
