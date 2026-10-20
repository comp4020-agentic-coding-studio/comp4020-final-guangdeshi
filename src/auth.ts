// Authentication primitives: password hashing, session tokens, and CSRF.
// Authorization (who may act on what) lives in server.ts next to each route,
// per CLAUDE.md's "authentication says who, authorization says what" split.
import { randomBytes, scryptSync, timingSafeEqual, createHash, randomUUID } from "node:crypto";
import {
  createSessionRow,
  deleteSession as dbDeleteSession,
  getSessionByTokenHash,
  getUserById,
  touchSession,
  type User,
} from "./db.ts";

// scrypt parameters chosen to cost ~150-200ms per hash on typical hardware
// (OWASP's current minimum recommendation is N=2^17 and p=1 for a dedicated
// auth server); encoded alongside the hash so parameters can be upgraded
// later without invalidating already-stored hashes.
const SCRYPT_PARAMS = { N: 131072, r: 8, p: 1 } as const;
const KEY_LENGTH = 64;
const SCRYPT_MAXMEM = 256 * 1024 * 1024;

export function hashPassword(password: string): string {
  const salt = randomBytes(16);
  const hash = scryptSync(password, salt, KEY_LENGTH, { ...SCRYPT_PARAMS, maxmem: SCRYPT_MAXMEM });
  return `scrypt$N=${SCRYPT_PARAMS.N},r=${SCRYPT_PARAMS.r},p=${SCRYPT_PARAMS.p}$${salt.toString("base64")}$${hash.toString("base64")}`;
}

export function verifyPassword(password: string, encoded: string): boolean {
  try {
    const [scheme, paramsStr, saltB64, hashB64] = encoded.split("$");
    if (scheme !== "scrypt") return false;
    const params: Record<string, number> = {};
    for (const pair of paramsStr.split(",")) {
      const [k, v] = pair.split("=");
      params[k] = Number(v);
    }
    const salt = Buffer.from(saltB64, "base64");
    const expected = Buffer.from(hashB64, "base64");
    const actual = scryptSync(password, salt, expected.length, {
      N: params.N,
      r: params.r,
      p: params.p,
      maxmem: SCRYPT_MAXMEM,
    });
    return actual.length === expected.length && timingSafeEqual(actual, expected);
  } catch {
    return false;
  }
}

const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export interface NewSession {
  token: string;
  csrfToken: string;
  expiresAt: string;
}

/**
 * Only the SHA-256 hash of the session token is stored in the database, the
 * same pattern as the course's reference server.ts for password-equivalent
 * secrets: a stolen database backup doesn't hand over live session cookies.
 * The CSRF secret is generated per-session and handed to the client as a
 * separate token (see requireCsrf), so a cross-site request that carries the
 * session cookie automatically still can't forge the CSRF token.
 */
export function createSession(userId: string): NewSession {
  const token = randomBytes(32).toString("base64url");
  const csrfToken = randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + SESSION_TTL_MS).toISOString();
  createSessionRow(hashToken(token), userId, hashToken(csrfToken), expiresAt);
  return { token, csrfToken, expiresAt };
}

export interface AuthContext {
  user: User;
  csrfSecretHash: string;
}

export function resolveSession(token: string | undefined): AuthContext | undefined {
  if (!token) return undefined;
  const tokenHash = hashToken(token);
  const session = getSessionByTokenHash(tokenHash);
  if (!session) return undefined;
  if (new Date(session.expiresAt).getTime() < Date.now()) {
    dbDeleteSession(tokenHash);
    return undefined;
  }
  const user = getUserById(session.userId);
  if (!user) return undefined;
  touchSession(tokenHash);
  return { user, csrfSecretHash: session.csrfSecret };
}

export function destroySession(token: string): void {
  dbDeleteSession(hashToken(token));
}

export function verifyCsrfToken(csrfSecretHash: string, providedToken: string | undefined): boolean {
  if (!providedToken) return false;
  const expected = Buffer.from(csrfSecretHash, "hex");
  const actual = Buffer.from(hashToken(providedToken), "hex");
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}

// ------------------------------------------------------- rate limiting ----

// In-memory, per-process fixed-window limiter. Good enough for a single-
// machine Fly deployment (the course's own constraint is one machine, one
// volume); documented in docs/architecture/AUTH_AND_PERMISSIONS.md as a
// known limitation that would need a shared store behind a load balancer.
interface Bucket {
  count: number;
  resetAt: number;
}
const buckets = new Map<string, Bucket>();

export function checkRateLimit(key: string, limit: number, windowMs: number): boolean {
  const now = Date.now();
  const bucket = buckets.get(key);
  if (!bucket || bucket.resetAt < now) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return true;
  }
  if (bucket.count >= limit) return false;
  bucket.count += 1;
  return true;
}

// Swept periodically from server.ts so the map doesn't grow unboundedly.
export function sweepRateLimitBuckets(): void {
  const now = Date.now();
  for (const [key, bucket] of buckets) {
    if (bucket.resetAt < now) buckets.delete(key);
  }
}

export function newRequestId(): string {
  return randomUUID();
}

// ------------------------------------------------------------ validation --

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const HANDLE_RE = /^[a-z0-9][a-z0-9_-]{2,29}$/;

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

export function isValidEmail(email: string): boolean {
  return EMAIL_RE.test(email) && email.length <= 254;
}

export function normalizeHandle(handle: string): string {
  return handle.trim().toLowerCase();
}

export function isValidHandle(handle: string): boolean {
  return HANDLE_RE.test(handle);
}

export function isValidPassword(password: string): boolean {
  return typeof password === "string" && password.length >= 8 && password.length <= 256;
}
