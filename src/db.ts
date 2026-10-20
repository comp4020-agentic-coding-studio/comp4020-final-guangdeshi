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
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function createUser(email: string, handle: string, passwordHash: string, displayName: string): User {
  const id = randomUUID();
  const ts = now();
  db.prepare(
    `INSERT INTO users (id, email, handle, password_hash, display_name, bio, avatar_image_id, is_admin, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, '', NULL, 0, ?, ?)`,
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
  createdAt: string;
  updatedAt: string;
}

function rowToPost(row: any): Post {
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
}

export function createPost(input: NewPost, imageIds: string[]): Post {
  const id = randomUUID();
  const ts = now();
  db.exec("BEGIN");
  try {
    db.prepare(
      `INSERT INTO posts (id, author_id, title, description, price_cents, currency, category_id, tags, visibility, status, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'active', ?, ?)`,
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
  const clauses = ["status = 'active'", "visibility = 'public'"];
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
       WHERE p.status = 'active' AND p.visibility = 'public'
       GROUP BY p.id
       ORDER BY opinion_count DESC, p.created_at DESC
       LIMIT ?`,
    )
    .all(limit) as any[];
  return rows.map((row) => ({ ...rowToPost(row), opinionCount: row.opinion_count }));
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

// ------------------------------------------------------------ opinions ----

export type Stance = "BUY" | "PASS";

export interface Opinion {
  id: string;
  postId: string;
  userId: string;
  stance: Stance;
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
    comment: row.comment,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

/**
 * Create-or-update a user's opinion on a post in one atomic statement. This
 * is the mechanism that satisfies "one current opinion per (post_id,
 * user_id)" and "don't double-count concurrent submissions": the uniqueness
 * is a real database constraint (not just an application check), and the
 * whole read-modify-write is a single prepared-statement execution, so two
 * racing requests for the same (post, user) can't both "win" and create two
 * rows — the second one simply updates the first.
 */
export function upsertOpinion(postId: string, userId: string, stance: Stance, comment: string): Opinion {
  const id = randomUUID();
  const ts = now();
  db.prepare(
    `INSERT INTO opinions (id, post_id, user_id, stance, comment, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(post_id, user_id) DO UPDATE SET stance = excluded.stance, comment = excluded.comment, updated_at = excluded.updated_at`,
  ).run(id, postId, userId, stance, comment, ts, ts);
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

export function getOpinionCounts(postId: string): { buy: number; pass: number } {
  const rows = db
    .prepare(`SELECT stance, COUNT(*) AS n FROM opinions WHERE post_id = ? GROUP BY stance`)
    .all(postId) as any[];
  const counts = { buy: 0, pass: 0 };
  for (const r of rows) {
    if (r.stance === "BUY") counts.buy = r.n;
    else counts.pass = r.n;
  }
  return counts;
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
}

function rowToOutcome(row: any): PostOutcome {
  return {
    postId: row.post_id,
    status: row.status,
    reflection: row.reflection,
    decidedAt: row.decided_at,
    updatedAt: row.updated_at,
  };
}

export function upsertOutcome(postId: string, status: OutcomeStatus, reflection: string): PostOutcome {
  const ts = now();
  db.prepare(
    `INSERT INTO post_outcomes (post_id, status, reflection, decided_at, updated_at)
     VALUES (?, ?, ?, ?, ?)
     ON CONFLICT(post_id) DO UPDATE SET status = excluded.status, reflection = excluded.reflection, updated_at = excluded.updated_at`,
  ).run(postId, status, reflection, ts, ts);
  return getOutcome(postId)!;
}

export function getOutcome(postId: string): PostOutcome | undefined {
  const row = db.prepare(`SELECT * FROM post_outcomes WHERE post_id = ?`).get(postId);
  return row ? rowToOutcome(row) : undefined;
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
