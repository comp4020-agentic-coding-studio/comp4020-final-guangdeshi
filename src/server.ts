// HTTP entrypoint and router. Authentication (who) happens once per request
// via identify(); authorization (what they may do) is checked individually
// in each route handler, right next to the action it guards — per
// CLAUDE.md's "authentication says who, authorization says what" split,
// and so a grep for "req.user.id !==" finds every authorization boundary
// in one place rather than a separate middleware layer that's easy to
// forget to apply to a new route.
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { readFileSync, existsSync } from "node:fs";
import { extname, join } from "node:path";
import { URL } from "node:url";
import { randomBytes, timingSafeEqual } from "node:crypto";
import {
  checkRateLimit,
  createSession,
  destroySession,
  hashPassword,
  isValidEmail,
  isValidHandle,
  isValidPassword,
  newRequestId,
  normalizeEmail,
  normalizeHandle,
  resolveSession,
  sweepRateLimitBuckets,
  verifyCsrfToken,
  verifyPassword,
  type AuthContext,
} from "./auth.ts";
import {
  anyAdminExists,
  createDemoUser,
  createPost,
  createReport,
  createUser,
  deleteExpiredSessions,
  deleteOpinion,
  deletePostContext,
  getCategoryById,
  getDemoFeed,
  getOpinionById,
  getOpinionByPostAndUser,
  getOpinionCounts,
  getOptionCounts,
  getOutcome,
  getPostById,
  getPostContext,
  getPurchaseOptionById,
  getPurchaseOptionsForPost,
  getImageById,
  getPostImageIds,
  getUserByEmail,
  getUserByHandle,
  getUserById,
  getUserInterests,
  indexPostForSearch,
  listCategories,
  listFeed,
  listMostDiscussed,
  listOpinionsByUser,
  listOpinionsForPost,
  listPostsByAuthor,
  listRecentActivity,
  activityStats,
  listReports,
  promoteToAdmin,
  removePostFromSearchIndex,
  resolveReport,
  searchPosts,
  setInfluentialOpinion,
  setPostContext,
  setPurchaseOptions,
  setUserInterests,
  softDeletePost,
  updatePost,
  updateUserPassword,
  updateUserProfile,
  upsertComparisonOpinion,
  upsertOpinion,
  upsertOutcome,
  type ComparisonSelection,
  type NewPurchaseOption,
  type Post,
  type PostMode,
  type PostOutcome,
  type User,
} from "./db.ts";
import { CONTEXT_SCHEMA_VERSION, getContextPrompts, getSubtypeSuggestions } from "./context-prompts.ts";
import { ImageValidationError, processAndStoreImage, readImageFile } from "./images.ts";
import { logEvent } from "./logger.ts";
import { seedDemoContent } from "../scripts/seed-demo-content.ts";
import { MultipartError, parseMultipart } from "./multipart.ts";
import { renderMarkdown, renderReadmePage } from "./markdown.ts";
import {
  adminPage,
  createEditPostPage,
  demoFeedPage,
  discoverPage,
  errorPage,
  landingPage,
  loginPage,
  myActivityPage,
  notFoundPage,
  postDetailPage,
  profilePage,
  registerPage,
  type ActivityFeedItem,
  type DiscoverFeedItem,
} from "./pages.ts";
import { recommendationService } from "./recommendation/chronological.ts";
import { addLogClient, addPostClient, broadcastToPost, sseClientCounts, startHeartbeat } from "./sse.ts";
import {
  normalizeTags,
  validateComparisonOpinionInput,
  validateContextAnswers,
  validateOpinionInput,
  validateOutcomeInput,
  validatePostInput,
  validatePurchaseOptionCount,
  validatePurchaseOptionInput,
} from "./validation.ts";
import type { ViewerContext } from "./render.ts";

const PORT = Number(process.env.PORT ?? 8080);
const COOKIE_NAME = "bop_session";
// The integration suite in spec/ registers dozens of accounts from one IP
// (localhost) in a few seconds — a pattern no real visitor produces, but one
// that would otherwise trip the same register/login rate limits this file
// enforces for real traffic. RATE_LIMIT_SCALE multiplies every limit's
// allowance (never its window), so the limiter's actual logic is exercised
// unchanged; only the test runner sets this (see package.json's "test"
// script), and it defaults to 1 (unscaled) everywhere else, including prod.
const RATE_LIMIT_SCALE = Math.max(1, Number(process.env.RATE_LIMIT_SCALE ?? 1));
const MAX_BODY_BYTES = 256 * 1024; // non-multipart bodies only; images go through parseMultipart's own limit
const README_PATH = process.env.README_PATH ?? "./README.md";

// ------------------------------------------------------------- helpers ----

function parseCookies(header: string | undefined): Record<string, string> {
  const out: Record<string, string> = {};
  if (!header) return out;
  for (const part of header.split(";")) {
    const idx = part.indexOf("=");
    if (idx === -1) continue;
    const key = part.slice(0, idx).trim();
    const value = part.slice(idx + 1).trim();
    if (key) out[key] = decodeURIComponent(value);
  }
  return out;
}

function clientIp(req: IncomingMessage): string {
  const forwarded = req.headers["x-forwarded-for"];
  if (typeof forwarded === "string" && forwarded.length > 0) return forwarded.split(",")[0].trim();
  return req.socket.remoteAddress ?? "unknown";
}

function sendJson(res: ServerResponse, status: number, body: unknown): void {
  const json = JSON.stringify(body);
  res.writeHead(status, { "Content-Type": "application/json; charset=utf-8" });
  res.end(json);
}

function sendHtml(res: ServerResponse, status: number, html: string): void {
  res.writeHead(status, { "Content-Type": "text/html; charset=utf-8" });
  res.end(html);
}

function redirect(res: ServerResponse, location: string, status = 303): void {
  res.writeHead(status, { Location: location });
  res.end();
}

function wantsJson(req: IncomingMessage): boolean {
  const accept = req.headers.accept ?? "";
  const contentType = req.headers["content-type"] ?? "";
  return accept.includes("application/json") || contentType.includes("application/json");
}

interface ParsedBody {
  fields: Record<string, any>;
  files: { fieldname: string; buffer: Buffer }[];
}

async function readRawBody(req: IncomingMessage): Promise<Buffer> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > MAX_BODY_BYTES) throw new Error("payload too large");
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
}

async function parseBody(req: IncomingMessage): Promise<ParsedBody> {
  const contentType = req.headers["content-type"] ?? "";
  if (contentType.includes("multipart/form-data")) {
    const { fields, files } = await parseMultipart(req);
    return { fields, files: files.map((f) => ({ fieldname: f.fieldname, buffer: f.buffer })) };
  }
  const raw = await readRawBody(req);
  if (contentType.includes("application/json")) {
    const text = raw.toString("utf8").trim();
    return { fields: text ? JSON.parse(text) : {}, files: [] };
  }
  const params = new URLSearchParams(raw.toString("utf8"));
  const fields: Record<string, any> = {};
  // A repeated key (e.g. several `interests` checkboxes) must collect into
  // an array rather than the last value silently winning — the same
  // behavior parseMultipart's busboy "field" handler needs for multipart
  // forms with repeated checkbox names.
  for (const [key, value] of params) {
    if (key in fields) {
      fields[key] = Array.isArray(fields[key]) ? [...fields[key], value] : [fields[key], value];
    } else {
      fields[key] = value;
    }
  }
  return { fields, files: [] };
}

function getCsrfTokenFromRequest(req: IncomingMessage, body: ParsedBody): string | undefined {
  const header = req.headers["x-csrf-token"];
  if (typeof header === "string") return header;
  return typeof body.fields.csrf === "string" ? body.fields.csrf : undefined;
}

class HttpError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

function requireCsrf(req: IncomingMessage, body: ParsedBody, auth: AuthContext): void {
  const token = getCsrfTokenFromRequest(req, body);
  if (!verifyCsrfToken(auth.csrfSecretHash, token)) {
    throw new HttpError(403, "invalid or missing CSRF token");
  }
}

// ----------------------------------------------------- request context ----

interface RequestContext {
  req: IncomingMessage;
  res: ServerResponse;
  url: URL;
  requestId: string;
  startedAt: number;
  auth: AuthContext | undefined;
  sessionToken: string | undefined;
}

function viewerContextOf(ctx: RequestContext): ViewerContext {
  return { user: ctx.auth?.user ?? null, csrfToken: ctx.auth ? deriveCsrfTokenPlaceholder(ctx) : null };
}

// The CSRF token handed to templates must be the *plaintext* token the
// client sends back, not the hash stored server-side. We mint it once per
// session at login/register time and re-derive it per-request from the
// session cookie value itself would require storing the plaintext, which we
// deliberately don't (see auth.ts). Instead, the plaintext CSRF token was
// already delivered to the client as a second cookie at login time; pages
// read it from there via app.js and inject it into forms client-side is
// unnecessarily complex for a template-rendered form. Simpler and still
// secure: expose the plaintext CSRF token in a non-HttpOnly cookie
// (`bop_csrf`), readable by our own same-origin JS/templates, analogous to
// the common "double submit cookie" CSRF pattern layered on top of the
// server-side session-bound secret check in auth.ts.
function deriveCsrfTokenPlaceholder(ctx: RequestContext): string {
  const cookies = parseCookies(ctx.req.headers.cookie);
  return cookies["bop_csrf"] ?? "";
}

function requireAuth(ctx: RequestContext): AuthContext {
  if (!ctx.auth) throw new HttpError(401, "log in required");
  return ctx.auth;
}

// -------------------------------------------------------------- logging ---

function log(ctx: RequestContext, action: Parameters<typeof logEvent>[0]["action"], status: "success" | "failure", opts?: { targetType?: string; targetId?: string; meta?: Record<string, unknown> }): void {
  logEvent({
    requestId: ctx.requestId,
    userId: ctx.auth?.user.id ?? null,
    action,
    status,
    targetType: opts?.targetType,
    targetId: opts?.targetId,
    latencyMs: Date.now() - ctx.startedAt,
    meta: opts?.meta,
  });
}

// ---------------------------------------------------------- view models ---

function toDiscoverItem(post: ReturnType<typeof getPostById>): DiscoverFeedItem {
  const p = post!;
  const author = getUserById(p.authorId)!;
  const category = getCategoryById(p.categoryId)!;
  const counts = getOpinionCounts(p.id);
  const imageIds = getPostImageIds(p.id);
  return {
    post: p,
    coverImageId: imageIds[0] ?? null,
    authorHandle: author.handle,
    authorDisplayName: author.displayName,
    categoryName: category.name,
    buyCount: counts.buy,
    passCount: counts.pass,
  };
}

// ------------------------------------------------------------- routing ----

async function handle(ctx: RequestContext): Promise<void> {
  const { req, res, url } = ctx;
  const method = req.method ?? "GET";
  const path = url.pathname;

  // ---- static & infra ----
  if (method === "GET" && path === "/") return handleLanding(ctx);
  if (method === "GET" && path === "/readme/") return handleReadme(ctx);
  if (method === "GET" && path.startsWith("/static/")) return handleStatic(ctx);
  if (method === "GET" && path.startsWith("/images/")) return handleImage(ctx);
  if (method === "GET" && path === "/healthz") return sendJson(res, 200, { ok: true });

  // ---- auth ----
  if (method === "GET" && path === "/register") return handleRegisterForm(ctx);
  if (method === "POST" && path === "/register") return handleRegisterSubmit(ctx);
  if (method === "GET" && path === "/login") return handleLoginForm(ctx);
  if (method === "POST" && path === "/login") return handleLoginSubmit(ctx);
  if (method === "POST" && path === "/logout") return handleLogout(ctx);

  // ---- discover ----
  if (method === "GET" && path === "/discover") return handleDiscover(ctx);
  if (method === "GET" && path === "/discover/demo") return handleDemoFeed(ctx);

  // ---- posts ----
  if (method === "GET" && path === "/posts/new") return handleNewPostForm(ctx);
  if (method === "POST" && path === "/posts/new") return handleCreatePost(ctx);

  const postMatch = path.match(/^\/posts\/([a-f0-9-]{36})(\/.*)?$/);
  if (postMatch) {
    const postId = postMatch[1];
    const sub = postMatch[2] ?? "";
    if (method === "GET" && sub === "") return handlePostDetail(ctx, postId);
    if (method === "GET" && sub === "/edit") return handleEditPostForm(ctx, postId);
    if (method === "POST" && sub === "/edit") return handleUpdatePost(ctx, postId);
    if (method === "POST" && sub === "/delete") return handleDeletePost(ctx, postId);
    if (method === "POST" && sub === "/opinions") return handleSubmitOpinion(ctx, postId);
    if (method === "POST" && sub === "/outcome") return handleSetOutcome(ctx, postId);
    if (method === "POST" && sub === "/report") return handleReportPost(ctx, postId);
    if (method === "GET" && sub === "/events") return handlePostEvents(ctx, postId);
    const influentialMatch = sub.match(/^\/opinions\/([a-f0-9-]{36})\/influential$/);
    if (method === "POST" && influentialMatch) return handleSetInfluentialOpinion(ctx, postId, influentialMatch[1]);
  }

  const opinionMatch = path.match(/^\/opinions\/([a-f0-9-]{36})\/(edit|delete)$/);
  if (opinionMatch && method === "POST") {
    return handleOpinionMutation(ctx, opinionMatch[1], opinionMatch[2] as "edit" | "delete");
  }

  // ---- profile ----
  const profileMatch = path.match(/^\/u\/([a-z0-9_-]{3,30})$/);
  if (method === "GET" && profileMatch) return handleProfile(ctx, profileMatch[1]);
  if (method === "POST" && path === "/me/profile") return handleUpdateProfile(ctx);
  if (method === "POST" && path === "/me/password") return handleChangePassword(ctx);
  if (method === "POST" && path === "/me/interests") return handleUpdateInterests(ctx);
  if (method === "GET" && path === "/me/activity") return handleMyActivity(ctx);

  // ---- admin / observability ----
  if (method === "GET" && path === "/admin") return handleAdminPage(ctx);
  if (method === "GET" && path === "/admin/events") return handleAdminEvents(ctx);
  if (method === "GET" && path === "/admin/api/stats") return handleAdminStats(ctx);
  if (method === "GET" && path === "/admin/api/reports") return handleAdminReports(ctx);
  const reportResolveMatch = path.match(/^\/admin\/api\/reports\/([a-f0-9-]{36})\/resolve$/);
  if (method === "POST" && reportResolveMatch) return handleAdminResolveReport(ctx, reportResolveMatch[1]);
  if (method === "POST" && path === "/admin/bootstrap") return handleAdminBootstrap(ctx);
  if (method === "POST" && path === "/admin/demo/seed") return handleAdminSeedDemo(ctx);

  throw new HttpError(404, "not found");
}

// ------------------------------------------------------------- landing ----

function handleLanding(ctx: RequestContext): void {
  const { posts } = listFeed({ limit: 6 });
  const featured = posts.map(toDiscoverItem);
  sendHtml(ctx.res, 200, landingPage(viewerContextOf(ctx), featured));
}

function handleReadme(ctx: RequestContext): void {
  const md = existsSync(README_PATH) ? readFileSync(README_PATH, "utf8") : "# Buy or Pass\n\nREADME not found.";
  sendHtml(ctx.res, 200, renderReadmePage(md));
}

const STATIC_TYPES: Record<string, string> = {
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".svg": "image/svg+xml",
};

function handleStatic(ctx: RequestContext): void {
  const rel = ctx.url.pathname.replace(/^\/static\//, "");
  if (rel.includes("..")) throw new HttpError(400, "bad path");
  const filePath = join("./src/public", rel);
  if (!existsSync(filePath)) throw new HttpError(404, "not found");
  const ext = extname(filePath);
  const body = readFileSync(filePath);
  ctx.res.writeHead(200, { "Content-Type": STATIC_TYPES[ext] ?? "application/octet-stream", "Cache-Control": "public, max-age=300" });
  ctx.res.end(body);
}

function handleImage(ctx: RequestContext): void {
  const id = ctx.url.pathname.replace(/^\/images\//, "");
  const image = getImageById(id);
  if (!image) throw new HttpError(404, "image not found");
  const buffer = readImageFile(image.filename);
  if (!buffer) throw new HttpError(404, "image not found");
  ctx.res.writeHead(200, { "Content-Type": image.mimeType, "Cache-Control": "public, max-age=31536000, immutable" });
  ctx.res.end(buffer);
}

// ---------------------------------------------------------------- auth ----

function handleRegisterForm(ctx: RequestContext): void {
  sendHtml(ctx.res, 200, registerPage(viewerContextOf(ctx), null, {}));
}

async function handleRegisterSubmit(ctx: RequestContext): Promise<void> {
  const body = await parseBody(ctx.req);
  const ip = clientIp(ctx.req);
  if (!checkRateLimit(`register:${ip}`, 10 * RATE_LIMIT_SCALE, 10 * 60 * 1000)) {
    throw new HttpError(429, "too many registration attempts, try again later");
  }

  const email = normalizeEmail(String(body.fields.email ?? ""));
  const handle = normalizeHandle(String(body.fields.handle ?? ""));
  const displayName = String(body.fields.displayName ?? "").trim();
  const password = String(body.fields.password ?? "");

  const renderError = (msg: string) => {
    log(ctx, "auth.register_failed", "failure", { meta: { reason: msg } });
    sendHtml(ctx.res, 400, registerPage(viewerContextOf(ctx), msg, { email, handle, displayName }));
  };

  if (!isValidEmail(email)) return renderError("Please enter a valid email address.");
  if (!isValidHandle(handle)) return renderError("Handle must be 3-30 characters: lowercase letters, numbers, - or _.");
  if (displayName.length === 0 || displayName.length > 60) return renderError("Display name is required (max 60 characters).");
  if (!isValidPassword(password)) return renderError("Password must be at least 8 characters.");
  if (getUserByEmail(email)) return renderError("An account with that email already exists.");
  if (getUserByHandle(handle)) return renderError("That handle is already taken.");

  const user = createUser(email, handle, hashPassword(password), displayName);
  issueSessionCookies(ctx.res, user.id);
  log(ctx, "auth.registered", "success", { targetType: "user", targetId: user.id });
  redirect(ctx.res, "/discover");
}

function handleLoginForm(ctx: RequestContext): void {
  sendHtml(ctx.res, 200, loginPage(viewerContextOf(ctx), null, {}));
}

async function handleLoginSubmit(ctx: RequestContext): Promise<void> {
  const body = await parseBody(ctx.req);
  const ip = clientIp(ctx.req);
  const email = normalizeEmail(String(body.fields.email ?? ""));
  const password = String(body.fields.password ?? "");

  // Rate limit by IP AND by email, so one attacker can't hammer a single
  // victim account from many IPs, nor spray many accounts from one IP.
  if (
    !checkRateLimit(`login-ip:${ip}`, 20 * RATE_LIMIT_SCALE, 10 * 60 * 1000) ||
    !checkRateLimit(`login-email:${email}`, 8 * RATE_LIMIT_SCALE, 10 * 60 * 1000)
  ) {
    log(ctx, "auth.login_failed", "failure", { meta: { reason: "rate_limited" } });
    sendHtml(ctx.res, 429, loginPage(viewerContextOf(ctx), "Too many attempts. Please wait a few minutes and try again.", { email }));
    return;
  }

  const user = getUserByEmail(email);
  // Always run a scrypt verification, even for a nonexistent user (against a
  // fixed dummy hash), so response timing doesn't reveal whether the email
  // is registered — a basic defense against user-enumeration via timing.
  const passwordOk = user ? verifyPassword(password, user.passwordHash) : verifyPassword(password, DUMMY_HASH);

  if (!user || !passwordOk) {
    log(ctx, "auth.login_failed", "failure", { meta: { reason: "bad_credentials" } });
    sendHtml(ctx.res, 401, loginPage(viewerContextOf(ctx), "Incorrect email or password.", { email }));
    return;
  }

  issueSessionCookies(ctx.res, user.id);
  log(ctx, "auth.logged_in", "success", { targetType: "user", targetId: user.id });
  redirect(ctx.res, "/discover");
}

const DUMMY_HASH = hashPassword(randomBytes(32).toString("hex"));

function issueSessionCookies(res: ServerResponse, userId: string): void {
  const session = createSession(userId);
  const isProd = process.env.NODE_ENV === "production";
  const secureAttr = isProd ? "; Secure" : "";
  res.setHeader("Set-Cookie", [
    `${COOKIE_NAME}=${encodeURIComponent(session.token)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=2592000${secureAttr}`,
    // Readable by our own JS/templates (not HttpOnly) so forms can embed the
    // CSRF token; the secret it proves possession of is itself only ever
    // stored hashed server-side (see auth.ts createSession).
    `bop_csrf=${encodeURIComponent(session.csrfToken)}; Path=/; SameSite=Lax; Max-Age=2592000${secureAttr}`,
  ]);
}

function handleLogout(ctx: RequestContext): void {
  if (ctx.sessionToken) destroySession(ctx.sessionToken);
  ctx.res.setHeader("Set-Cookie", [
    `${COOKIE_NAME}=; Path=/; HttpOnly; Max-Age=0`,
    `bop_csrf=; Path=/; Max-Age=0`,
  ]);
  log(ctx, "auth.logged_out", "success", { targetType: "user", targetId: ctx.auth?.user.id });
  redirect(ctx.res, "/");
}

// ------------------------------------------------------------ discover ----

function handleDiscover(ctx: RequestContext): void {
  const categoryId = ctx.url.searchParams.get("category") ?? undefined;
  const search = ctx.url.searchParams.get("q")?.trim() || undefined;
  const cursor = ctx.url.searchParams.get("cursor") ?? undefined;
  const sort = ctx.url.searchParams.get("sort") === "discussed" ? "discussed" : "recent";

  // "Most discussed" is a single bounded highlights page (no pagination, no
  // category/search combination) — see listMostDiscussed's own comment for
  // why. An explicit category or search filter otherwise always uses the
  // plain chronological query; recommendationService (interest-boosted)
  // only applies to the unfiltered default view, so a user's own filter
  // choice is never silently overridden by a "personalized" ordering.
  if (sort === "discussed" && !categoryId && !search) {
    const items = listMostDiscussed(20).map((post) => toDiscoverItem(post));
    sendHtml(ctx.res, 200, discoverPage(viewerContextOf(ctx), items, listCategories(), { sort: "discussed" }, null));
    return;
  }

  const result = categoryId || search
    ? listFeed({ categoryId, search, cursor, limit: 20 })
    : recommendationService.getFeedForUser(ctx.auth?.user.id ?? null, { cursor, limit: 20 });

  const items = result.posts.map(toDiscoverItem);
  sendHtml(ctx.res, 200, discoverPage(viewerContextOf(ctx), items, listCategories(), { categoryId, search, sort: "recent" }, result.nextCursor));
}

/**
 * Feature D's "Explore Demo" section — readable by anyone, no auth check,
 * per the brief's "allow visitors to read demo cases without registration."
 */
function handleDemoFeed(ctx: RequestContext): void {
  const items = getDemoFeed(30).map(toDiscoverItem);
  sendHtml(ctx.res, 200, demoFeedPage(viewerContextOf(ctx), items));
}

// ---------------------------------------------------------------- posts ---

function handleNewPostForm(ctx: RequestContext): void {
  requireAuth(ctx);
  sendHtml(ctx.res, 200, createEditPostPage(viewerContextOf(ctx), listCategories(), null, { kind: "create" }));
}

function parsePrice(raw: unknown): number | null {
  if (raw === undefined || raw === null || raw === "") return null;
  const n = Number(raw);
  if (!Number.isFinite(n) || n < 0) return null;
  return Math.round(n * 100);
}

/** Pulls the fields.option_name_0, option_price_0, ... fields back into an array of raw per-option inputs, for up to 4 option indices. Stops scanning once an index has no name field at all, so trailing empty "+ Add option" blocks the user never filled in are simply ignored rather than producing validation errors. */
function parseOptionInputsFromFields(fields: Record<string, any>): Array<{
  name: unknown;
  expectedPriceCents: unknown;
  currency: unknown;
  originalPriceCents: unknown;
  condition: unknown;
  sourceUrl: unknown;
  saleNote: unknown;
}> {
  const options: ReturnType<typeof parseOptionInputsFromFields> = [];
  for (let i = 0; i < 4; i++) {
    const name = fields[`option_name_${i}`];
    if (typeof name !== "string" || name.trim().length === 0) continue;
    options.push({
      name,
      expectedPriceCents: parsePrice(fields[`option_price_${i}`]),
      currency: String(fields[`option_currency_${i}`] ?? "AUD").toUpperCase(),
      originalPriceCents: parsePrice(fields[`option_original_price_${i}`]),
      condition: fields[`option_condition_${i}`] || null,
      sourceUrl: fields[`option_source_url_${i}`] || null,
      saleNote: fields[`option_sale_note_${i}`] || null,
    });
  }
  return options;
}

/** Collects context_<key> fields into a plain answers map, dropping blanks — an unanswered prompt should never become a stored empty-string answer (that's exactly the "blank card" the brief says never to render). */
function parseContextAnswersFromFields(fields: Record<string, any>, categoryId: string): Record<string, string> {
  const prompts = getContextPrompts(categoryId);
  const answers: Record<string, string> = {};
  for (const p of prompts) {
    const raw = fields[`context_${p.key}`];
    if (typeof raw === "string" && raw.trim().length > 0) answers[p.key] = raw.trim();
  }
  return answers;
}

async function handleCreatePost(ctx: RequestContext): Promise<void> {
  const auth = requireAuth(ctx);
  const body = await parseBody(ctx.req);
  requireCsrf(ctx.req, body, auth);

  const postMode: PostMode = body.fields.mode === "WHICH_ONE" ? "WHICH_ONE" : "BUY_PASS";
  const tags = normalizeTags(String(body.fields.tags ?? "").split(",").map((t) => t.trim()).filter(Boolean));
  const categoryId = String(body.fields.category ?? "");
  const freeText = String(body.fields.context_free_text ?? "").trim();
  const contextAnswers = parseContextAnswersFromFields(body.fields, categoryId);

  const rerenderError = (message: string, status = 400) => {
    log(ctx, "post.created", "failure", { meta: { reason: message } });
    sendHtml(ctx.res, status, createEditPostPage(viewerContextOf(ctx), listCategories(), message, { kind: "create" }));
  };

  if (postMode === "WHICH_ONE") {
    const rawOptions = parseOptionInputsFromFields(body.fields);
    const countCheck = validatePurchaseOptionCount(rawOptions.length);
    const optionErrors = rawOptions.flatMap((o, i) => validatePurchaseOptionInput(o, i).errors);
    const input = {
      title: String(body.fields.title ?? "").trim(),
      description: String(body.fields.description ?? "").trim(),
      priceCents: null,
      currency: null,
      categoryId,
      tags,
      visibility: body.fields.visibility === "unlisted" ? "unlisted" : "public",
    } as const;
    const postValidation = validatePostInput(input);
    const contextValidation = validateContextAnswers(categoryId, null, contextAnswers, freeText);
    const allErrors = [...postValidation.errors, ...countCheck.errors, ...optionErrors, ...contextValidation.errors];
    if (allErrors.length > 0) return rerenderError(allErrors.join(" "));

    const optionImageFiles = body.files.filter((f) => f.fieldname.startsWith("option_image_"));
    let optionImageIds: Record<number, string> = {};
    try {
      const results = await Promise.all(
        optionImageFiles.map(async (f) => {
          const index = Number(f.fieldname.replace("option_image_", ""));
          const row = await processAndStoreImage(auth.user.id, f.buffer);
          return [index, row.id] as const;
        }),
      );
      optionImageIds = Object.fromEntries(results);
    } catch (err) {
      const message = err instanceof ImageValidationError ? err.message : "could not process an option photo";
      return rerenderError(message);
    }

    const post = createPost({ authorId: auth.user.id, ...input, mode: "WHICH_ONE" }, []);
    const newOptions: NewPurchaseOption[] = rawOptions.map((o, i) => ({
      name: (o.name as string).trim(),
      imageId: optionImageIds[i] ?? null,
      expectedPriceCents: o.expectedPriceCents as number,
      currency: o.currency as string,
      originalPriceCents: o.originalPriceCents as number | null,
      condition: o.condition as string | null,
      sourceUrl: o.sourceUrl as string | null,
      saleNote: o.saleNote as string | null,
    }));
    setPurchaseOptions(post.id, newOptions);
    if (Object.keys(contextAnswers).length > 0 || freeText) {
      setPostContext(post.id, CONTEXT_SCHEMA_VERSION, categoryId, contextAnswers, freeText);
    }
    indexPostForSearch(post.id, post.title, post.description, [...Object.values(contextAnswers), freeText].join(" "));
    log(ctx, "post.created", "success", { targetType: "post", targetId: post.id, meta: { mode: "WHICH_ONE" } });
    redirect(ctx.res, `/posts/${post.id}`);
    return;
  }

  const priceCents = parsePrice(body.fields.price);
  const input = {
    title: String(body.fields.title ?? "").trim(),
    description: String(body.fields.description ?? "").trim(),
    priceCents,
    currency: priceCents !== null ? String(body.fields.currency ?? "AUD").toUpperCase() : null,
    categoryId,
    tags,
    visibility: body.fields.visibility === "unlisted" ? "unlisted" : "public",
  } as const;

  const validation = validatePostInput(input);
  const contextValidation = validateContextAnswers(categoryId, null, contextAnswers, freeText);
  validation.errors.push(...contextValidation.errors);
  const imageFiles = body.files.filter((f) => f.fieldname === "images");
  if (imageFiles.length === 0) validation.errors.push("at least one photo is required");
  if (imageFiles.length > 4) validation.errors.push("at most 4 photos are allowed");

  if (validation.errors.length > 0 || imageFiles.length === 0 || imageFiles.length > 4) {
    return rerenderError(validation.errors.join(" "));
  }

  let imageIds: string[];
  try {
    imageIds = await Promise.all(imageFiles.map((f) => processAndStoreImage(auth.user.id, f.buffer))).then((rows) => rows.map((r) => r.id));
  } catch (err) {
    const message = err instanceof ImageValidationError ? err.message : "could not process uploaded images";
    return rerenderError(message);
  }

  const post = createPost({ authorId: auth.user.id, ...input, mode: "BUY_PASS" }, imageIds);
  if (Object.keys(contextAnswers).length > 0 || freeText) {
    setPostContext(post.id, CONTEXT_SCHEMA_VERSION, categoryId, contextAnswers, freeText);
  }
  indexPostForSearch(post.id, post.title, post.description, [...Object.values(contextAnswers), freeText].join(" "));
  log(ctx, "post.created", "success", { targetType: "post", targetId: post.id });
  redirect(ctx.res, `/posts/${post.id}`);
}

function handlePostDetail(ctx: RequestContext, postId: string): void {
  const post = getPostById(postId);
  if (!post || post.status !== "active") throw new HttpError(404, "post not found");

  const author = getUserById(post.authorId)!;
  const category = getCategoryById(post.categoryId)!;
  const imageIds = getPostImageIds(post.id);
  const counts = getOpinionCounts(post.id);
  const opinions = listOpinionsForPost(post.id);
  const myOpinion = ctx.auth ? getOpinionByPostAndUser(post.id, ctx.auth.user.id) ?? null : null;
  const outcome = getOutcome(post.id) ?? null;
  const options = post.mode === "WHICH_ONE" ? getPurchaseOptionsForPost(post.id) : [];
  const optionCounts = post.mode === "WHICH_ONE" ? getOptionCounts(post.id) : undefined;
  const context = getPostContext(post.id) ?? null;
  const contextPrompts = getContextPrompts(post.categoryId);
  // Related decisions are a courtesy, not load-bearing — a search-index
  // hiccup must never break viewing the post itself.
  let relatedPosts: Post[] = [];
  try {
    relatedPosts = searchPosts(post.title, { excludePostId: post.id, limit: 4 }).map((r) => r.post);
  } catch {
    relatedPosts = [];
  }

  log(ctx, "post.opened", "success", { targetType: "post", targetId: post.id });

  sendHtml(
    ctx.res,
    200,
    postDetailPage(
      viewerContextOf(ctx),
      {
        post,
        images: imageIds.map((id) => ({ id })),
        author: { id: author.id, handle: author.handle, displayName: author.displayName },
        category,
        buyCount: counts.buy,
        passCount: counts.pass,
        opinions,
        myOpinion,
        outcome,
        shareUrl: `${ctx.url.origin}/posts/${post.id}`,
        options,
        optionCounts,
        context,
        contextPrompts,
        relatedPosts,
      },
      { message: ctx.url.searchParams.get("msg"), kind: (ctx.url.searchParams.get("kind") as "error" | "success") ?? "error" },
    ),
  );
}

function handleEditPostForm(ctx: RequestContext, postId: string): void {
  const auth = requireAuth(ctx);
  const post = getPostById(postId);
  if (!post || post.status !== "active") throw new HttpError(404, "post not found");
  if (post.authorId !== auth.user.id) {
    log(ctx, "authorization.denied", "failure", { targetType: "post", targetId: postId, meta: { attempted: "edit_form" } });
    throw new HttpError(403, "you can only edit your own posts");
  }
  const imageIds = getPostImageIds(post.id);
  const existingOptions = post.mode === "WHICH_ONE" ? getPurchaseOptionsForPost(post.id) : [];
  const existingContext = getPostContext(post.id) ?? null;
  sendHtml(
    ctx.res,
    200,
    createEditPostPage(viewerContextOf(ctx), listCategories(), null, {
      kind: "edit",
      post,
      existingImageIds: imageIds,
      existingOptions,
      existingContext,
    }),
  );
}

async function handleUpdatePost(ctx: RequestContext, postId: string): Promise<void> {
  const auth = requireAuth(ctx);
  const post = getPostById(postId);
  if (!post || post.status !== "active") throw new HttpError(404, "post not found");

  const body = await parseBody(ctx.req);
  requireCsrf(ctx.req, body, auth);

  // Server-side authorization: only the post's own author may edit it, full
  // stop — checked here regardless of whether the request came from the
  // edit form or a direct API call, since this function is the only path
  // that mutates a post.
  if (post.authorId !== auth.user.id) {
    log(ctx, "authorization.denied", "failure", { targetType: "post", targetId: postId, meta: { attempted: "edit" } });
    throw new HttpError(403, "you can only edit your own posts");
  }

  const tags = normalizeTags(String(body.fields.tags ?? "").split(",").map((t) => t.trim()).filter(Boolean));
  const categoryId = String(body.fields.category ?? "");
  const freeText = String(body.fields.context_free_text ?? "").trim();
  const contextAnswers = parseContextAnswersFromFields(body.fields, categoryId);
  const contextValidation = validateContextAnswers(categoryId, null, contextAnswers, freeText);

  const rerenderEditError = (message: string) => {
    log(ctx, "post.updated", "failure", { targetType: "post", targetId: postId, meta: { reason: message } });
    sendHtml(
      ctx.res,
      400,
      createEditPostPage(viewerContextOf(ctx), listCategories(), message, {
        kind: "edit",
        post,
        existingImageIds: getPostImageIds(post.id),
        existingOptions: post.mode === "WHICH_ONE" ? getPurchaseOptionsForPost(post.id) : [],
        existingContext: getPostContext(post.id) ?? null,
      }),
    );
  };

  if (post.mode === "WHICH_ONE") {
    const rawOptions = parseOptionInputsFromFields(body.fields);
    const countCheck = validatePurchaseOptionCount(rawOptions.length);
    const optionErrors = rawOptions.flatMap((o, i) => validatePurchaseOptionInput(o, i).errors);
    const input = {
      title: String(body.fields.title ?? "").trim(),
      description: String(body.fields.description ?? "").trim(),
      priceCents: null,
      currency: null,
      categoryId,
      tags,
      visibility: body.fields.visibility === "unlisted" ? "unlisted" : "public",
    } as const;
    const postValidation = validatePostInput(input);
    const allErrors = [...postValidation.errors, ...countCheck.errors, ...optionErrors, ...contextValidation.errors];
    if (allErrors.length > 0) return rerenderEditError(allErrors.join(" "));

    const existingOptions = getPurchaseOptionsForPost(postId);
    const optionImageFiles = body.files.filter((f) => f.fieldname.startsWith("option_image_"));
    const optionImageIds: Record<number, string> = {};
    try {
      for (const f of optionImageFiles) {
        const index = Number(f.fieldname.replace("option_image_", ""));
        const row = await processAndStoreImage(auth.user.id, f.buffer);
        optionImageIds[index] = row.id;
      }
    } catch (err) {
      const message = err instanceof ImageValidationError ? err.message : "could not process an option photo";
      return rerenderEditError(message);
    }

    updatePost(postId, input);
    const newOptions: NewPurchaseOption[] = rawOptions.map((o, i) => ({
      name: (o.name as string).trim(),
      imageId: optionImageIds[i] ?? existingOptions[i]?.imageId ?? null,
      expectedPriceCents: o.expectedPriceCents as number,
      currency: o.currency as string,
      originalPriceCents: o.originalPriceCents as number | null,
      condition: o.condition as string | null,
      sourceUrl: o.sourceUrl as string | null,
      saleNote: o.saleNote as string | null,
    }));
    setPurchaseOptions(postId, newOptions);
    if (Object.keys(contextAnswers).length > 0 || freeText) {
      setPostContext(postId, CONTEXT_SCHEMA_VERSION, categoryId, contextAnswers, freeText);
    } else {
      deletePostContext(postId);
    }
    indexPostForSearch(postId, input.title, input.description, [...Object.values(contextAnswers), freeText].join(" "));
    log(ctx, "post.updated", "success", { targetType: "post", targetId: postId });
    broadcastToPost(postId, "post-updated", { postId });
    redirect(ctx.res, `/posts/${postId}`);
    return;
  }

  const priceCents = parsePrice(body.fields.price);
  const input = {
    title: String(body.fields.title ?? "").trim(),
    description: String(body.fields.description ?? "").trim(),
    priceCents,
    currency: priceCents !== null ? String(body.fields.currency ?? "AUD").toUpperCase() : null,
    categoryId,
    tags,
    visibility: body.fields.visibility === "unlisted" ? "unlisted" : "public",
  } as const;

  const validation = validatePostInput(input);
  validation.errors.push(...contextValidation.errors);
  if (validation.errors.length > 0) return rerenderEditError(validation.errors.join(" "));

  const imageFiles = body.files.filter((f) => f.fieldname === "images");
  let imageIds: string[] | undefined;
  if (imageFiles.length > 0) {
    if (imageFiles.length > 4) return rerenderEditError("at most 4 photos are allowed");
    try {
      const rows = await Promise.all(imageFiles.map((f) => processAndStoreImage(auth.user.id, f.buffer)));
      imageIds = rows.map((r) => r.id);
    } catch (err) {
      const message = err instanceof ImageValidationError ? err.message : "could not process uploaded images";
      return rerenderEditError(message);
    }
  }

  const updated = updatePost(postId, input, imageIds);
  if (Object.keys(contextAnswers).length > 0 || freeText) {
    setPostContext(postId, CONTEXT_SCHEMA_VERSION, categoryId, contextAnswers, freeText);
  } else {
    deletePostContext(postId);
  }
  indexPostForSearch(postId, updated.title, updated.description, [...Object.values(contextAnswers), freeText].join(" "));
  log(ctx, "post.updated", "success", { targetType: "post", targetId: updated.id });
  broadcastToPost(postId, "post-updated", { postId });
  redirect(ctx.res, `/posts/${postId}`);
}

async function handleDeletePost(ctx: RequestContext, postId: string): Promise<void> {
  const auth = requireAuth(ctx);
  const post = getPostById(postId);
  if (!post) throw new HttpError(404, "post not found");
  const body = await parseBody(ctx.req);
  requireCsrf(ctx.req, body, auth);

  if (post.authorId !== auth.user.id && !auth.user.isAdmin) {
    log(ctx, "authorization.denied", "failure", { targetType: "post", targetId: postId, meta: { attempted: "delete" } });
    throw new HttpError(403, "you can only delete your own posts");
  }
  softDeletePost(postId);
  removePostFromSearchIndex(postId);
  log(ctx, "post.deleted", "success", { targetType: "post", targetId: postId });
  redirect(ctx.res, "/discover");
}

// ------------------------------------------------------------ opinions ----

async function handleSubmitOpinion(ctx: RequestContext, postId: string): Promise<void> {
  const auth = requireAuth(ctx);
  const post = getPostById(postId);
  if (!post || post.status !== "active") throw new HttpError(404, "post not found");

  const body = await parseBody(ctx.req);
  requireCsrf(ctx.req, body, auth);

  // Post authors do not vote on their own posts (brief §8 default): opinions
  // exist to surface outside perspectives, and an author's own thumbs-up
  // would be a confirmation of their own thinking, not community input.
  // Applies identically to both modes.
  if (post.authorId === auth.user.id) {
    log(ctx, "authorization.denied", "failure", { targetType: "post", targetId: postId, meta: { attempted: "self_opinion" } });
    throw new HttpError(403, "post authors can't submit an opinion on their own post");
  }

  if (post.mode === "WHICH_ONE") return handleSubmitComparisonOpinion(ctx, post, body);

  // A BUY_PASS post must receive a BUY_PASS-shaped submission — a
  // hand-crafted request sending selectedOptionId at a single-product post
  // is rejected the same way a missing stance would be, not silently
  // reinterpreted.
  if (typeof body.fields.selectedOptionId === "string") {
    log(ctx, "authorization.denied", "failure", { targetType: "post", targetId: postId, meta: { attempted: "comparison_opinion_on_buy_pass_post" } });
    throw new HttpError(400, "this post does not accept a comparison selection");
  }

  const input = { stance: body.fields.stance, comment: typeof body.fields.comment === "string" ? body.fields.comment.trim() : body.fields.comment };
  const validation = validateOpinionInput(input);
  if (!validation.ok) {
    if (wantsJson(ctx.req)) return sendJson(ctx.res, 400, { errors: validation.errors });
    redirect(ctx.res, `/posts/${postId}?kind=error&msg=${encodeURIComponent(validation.errors.join(" "))}`);
    return;
  }

  const existing = getOpinionByPostAndUser(postId, auth.user.id);
  // The actual duplicate-prevention guarantee is the database's UNIQUE
  // (post_id, user_id) constraint plus this process's synchronous db.ts
  // calls (see db.ts upsertOpinion) — this `existing` lookup only decides
  // which log action name to emit, it is not what prevents a race.
  const opinion = upsertOpinion(postId, auth.user.id, input.stance as "BUY" | "PASS", input.comment as string);
  log(ctx, existing ? "opinion.updated" : "opinion.created", "success", { targetType: "opinion", targetId: opinion.id, meta: { postId, stance: opinion.stance } });

  const counts = getOpinionCounts(postId);
  broadcastToPost(postId, "opinion-upserted", {
    opinion: { id: opinion.id, userId: opinion.userId, stance: opinion.stance, comment: opinion.comment, updatedAt: opinion.updatedAt, authorHandle: auth.user.handle },
    counts,
  });

  if (wantsJson(ctx.req)) return sendJson(ctx.res, 200, { opinion, counts });
  redirect(ctx.res, `/posts/${postId}`);
}

async function handleSubmitComparisonOpinion(ctx: RequestContext, post: Post, body: ParsedBody): Promise<void> {
  const auth = requireAuth(ctx);
  const postId = post.id;

  // A WHICH_ONE post must receive a comparison-shaped submission — a
  // hand-crafted BUY/PASS stance at a comparison post is rejected rather
  // than silently coerced into a selection.
  if (typeof body.fields.stance === "string") {
    log(ctx, "authorization.denied", "failure", { targetType: "post", targetId: postId, meta: { attempted: "buy_pass_opinion_on_comparison_post" } });
    throw new HttpError(400, "this post requires picking one of the options, not a Buy/Pass stance");
  }

  const rawSelection = body.fields.selectedOptionId;
  const input = { selectedOptionId: rawSelection, comment: typeof body.fields.comment === "string" ? body.fields.comment.trim() : body.fields.comment };
  const validation = validateComparisonOpinionInput(input);
  if (!validation.ok) {
    if (wantsJson(ctx.req)) return sendJson(ctx.res, 400, { errors: validation.errors });
    redirect(ctx.res, `/posts/${postId}?kind=error&msg=${encodeURIComponent(validation.errors.join(" "))}`);
    return;
  }

  let selection: ComparisonSelection;
  if (rawSelection === "none") {
    selection = { none: true };
  } else {
    const option = getPurchaseOptionById(rawSelection as string);
    // Rejects both a fabricated id and a real option id that belongs to a
    // DIFFERENT post — brief's explicit "selections belonging to another
    // post" rule, checked by actually loading the option and comparing its
    // own post_id, not by trusting the client's claim.
    if (!option || option.postId !== postId) {
      log(ctx, "authorization.denied", "failure", { targetType: "post", targetId: postId, meta: { attempted: "invalid_option_id" } });
      throw new HttpError(400, "that option does not belong to this post");
    }
    selection = { optionId: option.id };
  }

  const existing = getOpinionByPostAndUser(postId, auth.user.id);
  const opinion = upsertComparisonOpinion(postId, auth.user.id, selection, input.comment as string);
  log(ctx, existing ? "opinion.updated" : "opinion.created", "success", {
    targetType: "opinion",
    targetId: opinion.id,
    meta: { postId, selectedOptionId: opinion.selectedOptionId, selectedNone: opinion.selectedNone },
  });

  const optionCounts = getOptionCounts(postId);
  broadcastToPost(postId, "opinion-upserted", {
    opinion: {
      id: opinion.id,
      userId: opinion.userId,
      selectedOptionId: opinion.selectedOptionId,
      selectedNone: opinion.selectedNone,
      comment: opinion.comment,
      updatedAt: opinion.updatedAt,
      authorHandle: auth.user.handle,
    },
    optionCounts,
  });

  if (wantsJson(ctx.req)) return sendJson(ctx.res, 200, { opinion, optionCounts });
  redirect(ctx.res, `/posts/${postId}`);
}

async function handleOpinionMutation(ctx: RequestContext, opinionId: string, action: "edit" | "delete"): Promise<void> {
  const auth = requireAuth(ctx);
  const opinion = getOpinionById(opinionId);
  if (!opinion) throw new HttpError(404, "opinion not found");

  const body = await parseBody(ctx.req);
  requireCsrf(ctx.req, body, auth);

  // The core "users cannot edit or delete another person's opinion" rule:
  // ownership is derived from the session, never trusted from the request
  // body, and checked here regardless of which client calls this route.
  if (opinion.userId !== auth.user.id) {
    log(ctx, "authorization.denied", "failure", { targetType: "opinion", targetId: opinionId, meta: { attempted: action } });
    throw new HttpError(403, "you can only modify your own opinion");
  }

  if (action === "delete") {
    deleteOpinion(opinion.postId, opinion.userId);
    log(ctx, "opinion.deleted", "success", { targetType: "opinion", targetId: opinionId, meta: { postId: opinion.postId } });
    const counts = getOpinionCounts(opinion.postId);
    broadcastToPost(opinion.postId, "opinion-deleted", { opinionId, userId: opinion.userId, counts });
    if (wantsJson(ctx.req)) return sendJson(ctx.res, 200, { ok: true, counts });
    return redirect(ctx.res, `/posts/${opinion.postId}`);
  }

  const input = { stance: body.fields.stance ?? opinion.stance, comment: typeof body.fields.comment === "string" ? body.fields.comment.trim() : opinion.comment };
  const validation = validateOpinionInput(input);
  if (!validation.ok) {
    if (wantsJson(ctx.req)) return sendJson(ctx.res, 400, { errors: validation.errors });
    return redirect(ctx.res, `/posts/${opinion.postId}?kind=error&msg=${encodeURIComponent(validation.errors.join(" "))}`);
  }
  const updated = upsertOpinion(opinion.postId, auth.user.id, input.stance as "BUY" | "PASS", input.comment as string);
  log(ctx, "opinion.updated", "success", { targetType: "opinion", targetId: updated.id, meta: { postId: opinion.postId } });
  const counts = getOpinionCounts(opinion.postId);
  broadcastToPost(opinion.postId, "opinion-upserted", {
    opinion: { id: updated.id, userId: updated.userId, stance: updated.stance, comment: updated.comment, updatedAt: updated.updatedAt, authorHandle: auth.user.handle },
    counts,
  });
  if (wantsJson(ctx.req)) return sendJson(ctx.res, 200, { opinion: updated, counts });
  redirect(ctx.res, `/posts/${opinion.postId}`);
}

/**
 * Feature E: the buyer marks (or unmarks) one existing opinion on their own
 * post as the one that influenced their decision. Deliberately separate
 * from handleSetOutcome — the brief explicitly says the buyer shouldn't be
 * forced to record BOUGHT/DID_NOT_BUY/STILL_DECIDING before marking an
 * influential comment, so this writes directly via setInfluentialOpinion
 * rather than going through the outcome form at all.
 */
async function handleSetInfluentialOpinion(ctx: RequestContext, postId: string, opinionId: string): Promise<void> {
  const auth = requireAuth(ctx);
  const post = getPostById(postId);
  if (!post) throw new HttpError(404, "post not found");

  const body = await parseBody(ctx.req);
  requireCsrf(ctx.req, body, auth);

  // Only the post owner may set this marker (brief's explicit rule) —
  // checked server-side regardless of whether the UI even shows the
  // control to anyone else.
  if (post.authorId !== auth.user.id) {
    log(ctx, "authorization.denied", "failure", { targetType: "post", targetId: postId, meta: { attempted: "mark_influential" } });
    throw new HttpError(403, "only the post's author can mark an influential opinion");
  }

  const opinion = getOpinionById(opinionId);
  // The referenced opinion must belong to the same post (brief's explicit
  // rule) — checked by loading the opinion and comparing its own postId,
  // not by trusting the URL alone.
  if (!opinion || opinion.postId !== postId) {
    throw new HttpError(400, "that opinion does not belong to this post");
  }

  const unmark = body.fields.action === "unmark";
  const outcome = setInfluentialOpinion(postId, unmark ? null : opinionId);
  log(ctx, "outcome.recorded", "success", { targetType: "post", targetId: postId, meta: { influentialOpinionSet: !unmark } });
  broadcastToPost(postId, "outcome-updated", { outcome });
  if (wantsJson(ctx.req)) return sendJson(ctx.res, 200, { outcome });
  redirect(ctx.res, `/posts/${postId}`);
}

async function handleSetOutcome(ctx: RequestContext, postId: string): Promise<void> {
  const auth = requireAuth(ctx);
  const post = getPostById(postId);
  if (!post) throw new HttpError(404, "post not found");

  const body = await parseBody(ctx.req);
  requireCsrf(ctx.req, body, auth);

  // Only the post owner can record their purchase outcome — nobody else's
  // opinion of what the author "should" have done gets written here.
  if (post.authorId !== auth.user.id) {
    log(ctx, "authorization.denied", "failure", { targetType: "post", targetId: postId, meta: { attempted: "outcome" } });
    throw new HttpError(403, "only the post's author can record its purchase outcome");
  }

  const input = { status: body.fields.status, reflection: typeof body.fields.reflection === "string" ? body.fields.reflection.trim() : body.fields.reflection };
  const validation = validateOutcomeInput(input);
  if (!validation.ok) {
    if (wantsJson(ctx.req)) return sendJson(ctx.res, 400, { errors: validation.errors });
    return redirect(ctx.res, `/posts/${postId}?kind=error&msg=${encodeURIComponent(validation.errors.join(" "))}`);
  }

  let purchasedOptionId: string | null | undefined = undefined;
  const rawOptionId = body.fields.purchasedOptionId;
  if (post.mode === "WHICH_ONE" && typeof rawOptionId === "string" && rawOptionId !== "") {
    const option = getPurchaseOptionById(rawOptionId);
    if (!option || option.postId !== postId) {
      throw new HttpError(400, "that option does not belong to this post");
    }
    purchasedOptionId = option.id;
  } else if (post.mode === "WHICH_ONE" && rawOptionId === "") {
    purchasedOptionId = null;
  }

  const outcome = upsertOutcome(postId, input.status as any, (input.reflection as string) ?? "", purchasedOptionId);
  log(ctx, "outcome.recorded", "success", { targetType: "post", targetId: postId, meta: { status: outcome.status } });
  broadcastToPost(postId, "outcome-updated", { outcome });
  if (wantsJson(ctx.req)) return sendJson(ctx.res, 200, { outcome });
  redirect(ctx.res, `/posts/${postId}`);
}

async function handleReportPost(ctx: RequestContext, postId: string): Promise<void> {
  const auth = requireAuth(ctx);
  const post = getPostById(postId);
  if (!post) throw new HttpError(404, "post not found");
  const body = await parseBody(ctx.req);
  requireCsrf(ctx.req, body, auth);
  const reason = String(body.fields.reason ?? "").trim().slice(0, 500) || "unspecified";
  const report = createReport(auth.user.id, "post", postId, reason);
  log(ctx, "report.created", "success", { targetType: "post", targetId: postId, meta: { reportId: report.id } });
  if (wantsJson(ctx.req)) return sendJson(ctx.res, 200, { report });
  redirect(ctx.res, `/posts/${postId}`);
}

function handlePostEvents(ctx: RequestContext, postId: string): void {
  if (!getPostById(postId)) throw new HttpError(404, "post not found");
  addPostClient(ctx.res, postId);
}

// --------------------------------------------------------------- profile --

function handleProfile(ctx: RequestContext, handle: string): void {
  const profileUser = getUserByHandle(handle);
  if (!profileUser) throw new HttpError(404, "user not found");
  const isOwnProfile = ctx.auth?.user.id === profileUser.id;
  const interests = getUserInterests(profileUser.id).map((id) => getCategoryById(id)!).filter(Boolean);
  const authoredPosts = listPostsByAuthor(profileUser.id, isOwnProfile).map(toDiscoverItem);
  const opinionsGiven = isOwnProfile
    ? listOpinionsByUser(profileUser.id)
        .map((opinion) => ({
          opinion,
          post: getPostById(opinion.postId)!,
          optionName: opinion.selectedOptionId ? getPurchaseOptionById(opinion.selectedOptionId)?.name ?? null : null,
        }))
        .filter((o) => o.post)
    : [];
  const purchaseOutcomes = isOwnProfile
    ? authoredPosts
        .map((item) => ({ post: item.post, outcome: getOutcome(item.post.id) }))
        .filter((o): o is { post: Post; outcome: PostOutcome } => !!o.outcome)
    : [];

  sendHtml(
    ctx.res,
    200,
    profilePage(
      viewerContextOf(ctx),
      {
        profileUser,
        isOwnProfile,
        interests,
        allCategories: listCategories(),
        authoredPosts,
        opinionsGiven,
        purchaseOutcomes,
      },
      { message: ctx.url.searchParams.get("msg"), kind: (ctx.url.searchParams.get("kind") as "error" | "success") ?? "error" },
    ),
  );
}

async function handleUpdateProfile(ctx: RequestContext): Promise<void> {
  const auth = requireAuth(ctx);
  const body = await parseBody(ctx.req);
  requireCsrf(ctx.req, body, auth);
  const displayName = String(body.fields.displayName ?? "").trim().slice(0, 60);
  const bio = String(body.fields.bio ?? "").trim().slice(0, 300);
  if (displayName.length === 0) throw new HttpError(400, "display name is required");

  let avatarImageId: string | undefined;
  const avatarFile = body.files.find((f) => f.fieldname === "avatar");
  if (avatarFile) {
    try {
      const image = await processAndStoreImage(auth.user.id, avatarFile.buffer);
      avatarImageId = image.id;
    } catch (err) {
      const message = err instanceof ImageValidationError ? err.message : "could not process avatar image";
      redirect(ctx.res, `/u/${encodeURIComponent(auth.user.handle)}?kind=error&msg=${encodeURIComponent(message)}`);
      return;
    }
  }

  updateUserProfile(auth.user.id, { displayName, bio, ...(avatarImageId ? { avatarImageId } : {}) });
  redirect(ctx.res, `/u/${encodeURIComponent(auth.user.handle)}`);
}

async function handleChangePassword(ctx: RequestContext): Promise<void> {
  const auth = requireAuth(ctx);
  const body = await parseBody(ctx.req);
  requireCsrf(ctx.req, body, auth);
  const currentPassword = String(body.fields.currentPassword ?? "");
  const newPassword = String(body.fields.newPassword ?? "");

  // Changing a password still requires the current one — this isn't covered
  // by session possession alone, since a session could be hijacked (e.g. via
  // a device left logged in) without the attacker knowing the password.
  if (!verifyPassword(currentPassword, auth.user.passwordHash)) {
    redirect(ctx.res, `/u/${encodeURIComponent(auth.user.handle)}?kind=error&msg=${encodeURIComponent("Current password is incorrect.")}`);
    return;
  }
  if (!isValidPassword(newPassword)) {
    redirect(ctx.res, `/u/${encodeURIComponent(auth.user.handle)}?kind=error&msg=${encodeURIComponent("New password must be at least 8 characters.")}`);
    return;
  }

  updateUserPassword(auth.user.id, hashPassword(newPassword));
  log(ctx, "auth.password_changed", "success", { targetType: "user", targetId: auth.user.id });
  redirect(ctx.res, `/u/${encodeURIComponent(auth.user.handle)}?kind=success&msg=${encodeURIComponent("Password changed.")}`);
}

async function handleUpdateInterests(ctx: RequestContext): Promise<void> {
  const auth = requireAuth(ctx);
  const body = await parseBody(ctx.req);
  requireCsrf(ctx.req, body, auth);
  const raw = body.fields.interests;
  const ids = Array.isArray(raw) ? raw : raw ? [raw] : [];
  const valid = ids.filter((id: string) => getCategoryById(id));
  setUserInterests(auth.user.id, valid);
  redirect(ctx.res, `/u/${encodeURIComponent(auth.user.handle)}`);
}

function handleMyActivity(ctx: RequestContext): void {
  const auth = requireAuth(ctx);
  const myPosts = listPostsByAuthor(auth.user.id, true);
  const items: ActivityFeedItem[] = [];
  for (const post of myPosts) {
    const opinions = listOpinionsForPost(post.id);
    for (const o of opinions) {
      items.push({
        kind: "new_opinion",
        postId: post.id,
        postTitle: post.title,
        detail: `@${o.authorHandle} gave ${o.stance === "BUY" ? "👍 Buy" : "👎 Pass"}: "${o.comment.slice(0, 80)}"`,
        ts: o.updatedAt,
      });
    }
    const outcome = getOutcome(post.id);
    if (outcome) {
      items.push({ kind: "outcome_recorded", postId: post.id, postTitle: post.title, detail: `You recorded: ${outcome.status.replace("_", " ").toLowerCase()}`, ts: outcome.updatedAt });
    }
  }
  items.sort((a, b) => (a.ts < b.ts ? 1 : -1));
  sendHtml(ctx.res, 200, myActivityPage(viewerContextOf(ctx), items.slice(0, 50)));
}

// ----------------------------------------------------------------- admin --

/**
 * One-time, secret-gated promotion of the calling (already-registered,
 * already-logged-in) account to admin. No credential is baked into the app
 * or committed anywhere: ADMIN_BOOTSTRAP_SECRET is set via
 * `flyctl secrets set` (or left unset entirely, which disables this route
 * outright). It self-disables once any admin exists, so it cannot be used
 * to mint a second admin account or re-run after the first one — the
 * intended flow is: register a normal account through the public form,
 * then call this once with the secret to become that first admin. See
 * docs/architecture/AUTH_AND_PERMISSIONS.md for the full rationale.
 */
async function handleAdminBootstrap(ctx: RequestContext): Promise<void> {
  const auth = requireAuth(ctx);
  const configuredSecret = process.env.ADMIN_BOOTSTRAP_SECRET;
  if (!configuredSecret) {
    throw new HttpError(404, "not found");
  }
  const body = await parseBody(ctx.req);
  const providedSecret = typeof body.fields.secret === "string" ? body.fields.secret : "";
  const expected = Buffer.from(configuredSecret);
  const actual = Buffer.from(providedSecret);
  const matches = expected.length === actual.length && timingSafeEqual(expected, actual);
  if (!matches) {
    log(ctx, "authorization.denied", "failure", { meta: { attempted: "admin_bootstrap" } });
    throw new HttpError(403, "invalid bootstrap secret");
  }
  if (anyAdminExists()) {
    throw new HttpError(409, "an admin already exists; bootstrap is one-time only");
  }
  promoteToAdmin(auth.user.id);
  log(ctx, "auth.logged_in", "success", { targetType: "user", targetId: auth.user.id, meta: { reason: "admin_bootstrap" } });
  if (wantsJson(ctx.req)) return sendJson(ctx.res, 200, { ok: true });
  redirect(ctx.res, "/admin");
}

function requireAdmin(ctx: RequestContext): AuthContext {
  const auth = requireAuth(ctx);
  if (!auth.user.isAdmin) {
    log(ctx, "authorization.denied", "failure", { meta: { attempted: "admin_access" } });
    throw new HttpError(403, "admin access required");
  }
  return auth;
}

/**
 * Feature D: admin-triggered, idempotent demo-content seeding. Runs the
 * exact same scripts/seed-demo-content.ts logic the standalone CLI script
 * uses, in-process, so there is only ever one seeding code path to keep
 * correct. Re-running this after the demo set is already seeded (same
 * DEMO_SEED_VERSION) is a documented no-op, not an error, since an admin
 * might click it more than once.
 */
async function handleAdminSeedDemo(ctx: RequestContext): Promise<void> {
  requireAdmin(ctx);
  const result = await seedDemoContent();
  log(ctx, "post.created", "success", {
    meta: {
      reason: "demo_seed",
      alreadySeeded: result.alreadySeeded,
      usersCreated: result.usersCreated,
      postsCreated: result.postsCreated,
      seedVersion: result.seedVersion,
    },
  });
  if (wantsJson(ctx.req)) return sendJson(ctx.res, 200, result);
  redirect(ctx.res, "/discover/demo");
}

function handleAdminPage(ctx: RequestContext): void {
  requireAdmin(ctx);
  sendHtml(ctx.res, 200, adminPage(viewerContextOf(ctx)));
}

function handleAdminEvents(ctx: RequestContext): void {
  requireAdmin(ctx);
  const recent = listRecentActivity(50);
  addLogClient(ctx.res);
  // Replay recent history as synthetic events so a freshly opened
  // observability page isn't empty while waiting for new live activity.
  for (const event of recent.reverse()) {
    ctx.res.write(`event: activity\ndata: ${JSON.stringify(event)}\n\n`);
  }
}

function handleAdminStats(ctx: RequestContext): void {
  requireAdmin(ctx);
  const since = new Date(Date.now() - 60 * 60 * 1000).toISOString();
  const stats = activityStats(since);
  const sse = sseClientCounts();
  sendJson(ctx.res, 200, { ...stats, sseConnections: sse });
}

function handleAdminReports(ctx: RequestContext): void {
  requireAdmin(ctx);
  sendJson(ctx.res, 200, { reports: listReports("open") });
}

async function handleAdminResolveReport(ctx: RequestContext, reportId: string): Promise<void> {
  const auth = requireAdmin(ctx);
  const body = await parseBody(ctx.req);
  requireCsrf(ctx.req, body, auth);
  const resolution = body.fields.resolution === "dismissed" ? "dismissed" : "resolved";
  resolveReport(reportId, resolution);
  log(ctx, "report.resolved", "success", { targetType: "report", targetId: reportId, meta: { resolution } });
  sendJson(ctx.res, 200, { ok: true });
}

// --------------------------------------------------------------- server ---

const server = createServer(async (req, res) => {
  const requestId = newRequestId();
  res.setHeader("X-Request-Id", requestId);
  const startedAt = Date.now();
  const url = new URL(req.url ?? "/", `http://${req.headers.host ?? "localhost"}`);
  const cookies = parseCookies(req.headers.cookie);
  const sessionToken = cookies[COOKIE_NAME];
  const auth = resolveSession(sessionToken);

  const ctx: RequestContext = { req, res, url, requestId, startedAt, auth, sessionToken };

  try {
    await handle(ctx);
  } catch (err) {
    if (err instanceof HttpError) {
      log(ctx, "authorization.denied", "failure", { meta: { status: err.status, message: err.message } });
      if (wantsJson(req)) {
        sendJson(res, err.status, { error: err.message });
      } else if (err.status === 404) {
        sendHtml(res, 404, notFoundPage(viewerContextOf(ctx)));
      } else {
        sendHtml(res, err.status, errorPage(viewerContextOf(ctx), err.status, err.message));
      }
      return;
    }
    if (err instanceof MultipartError || err instanceof ImageValidationError) {
      sendHtml(res, 400, errorPage(viewerContextOf(ctx), 400, err.message));
      return;
    }
    console.error(JSON.stringify({ level: "error", requestId, message: (err as Error).message, stack: (err as Error).stack }));
    if (!res.headersSent) {
      sendHtml(res, 500, errorPage(viewerContextOf(ctx), 500, "Something went wrong. Please try again."));
    }
  }
});

startHeartbeat();
setInterval(() => {
  deleteExpiredSessions();
  sweepRateLimitBuckets();
}, 10 * 60 * 1000);

server.listen(PORT, () => {
  console.log(JSON.stringify({ level: "info", message: `Buy or Pass listening on http://localhost:${PORT}`, port: PORT }));
});

export { server };
