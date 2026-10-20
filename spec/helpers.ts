// Shared test fixtures: each `register()` call is a fresh account with its
// own cookie jar, standing in for "a separate browser profile" the way the
// course's own marking method tests multi-user behavior.
import { inject } from "vitest";
import sharp from "sharp";
import { randomBytes } from "node:crypto";

export const baseUrl = (): string => inject("baseUrl");

export interface Session {
  sessionCookie: string;
  csrfToken: string;
  userId: string;
  handle: string;
  email: string;
}

function extractCookies(res: Response): Record<string, string> {
  // Node's fetch Headers collapses multiple Set-Cookie into getSetCookie().
  const raws = (res.headers as any).getSetCookie?.() ?? [];
  const out: Record<string, string> = {};
  for (const raw of raws) {
    const [pair] = raw.split(";");
    const idx = pair.indexOf("=");
    out[pair.slice(0, idx)] = pair.slice(idx + 1);
  }
  return out;
}

let counter = 0;
function unique(prefix: string): string {
  counter += 1;
  // Date.now() + an in-process counter alone can collide across parallel
  // vitest test files (each has its own module instance, so the counter
  // resets to 0 in each), hence the extra random suffix.
  return `${prefix}${Date.now()}${counter}${randomBytes(3).toString("hex")}`;
}

export async function registerUser(opts?: { displayName?: string }): Promise<Session> {
  const handle = unique("u");
  const email = `${handle}@example.com`;
  const displayName = opts?.displayName ?? `Test ${handle}`;
  const res = await fetch(new URL("/register", baseUrl()), {
    method: "POST",
    redirect: "manual",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ email, handle, displayName, password: "password123" }),
  });
  if (res.status !== 303) {
    throw new Error(`registration failed for ${handle}: ${res.status} ${await res.text()}`);
  }
  const cookies = extractCookies(res);
  const sessionCookie = cookies["bop_session"];
  const csrfToken = cookies["bop_csrf"];
  if (!sessionCookie || !csrfToken) throw new Error("registration did not issue session/csrf cookies");

  // Fetch the user's own id via their profile page isn't JSON, so pull it
  // from the DB-free route /u/:handle is also HTML. Simplest reliable path:
  // decode nothing extra — tests that need userId derive it from opinions
  // they create; expose a cheap accessor instead.
  return { sessionCookie, csrfToken, userId: "", handle, email };
}

export function cookieHeader(session: Session): string {
  return `bop_session=${session.sessionCookie}; bop_csrf=${session.csrfToken}`;
}

export async function apiCall(session: Session, path: string, init: RequestInit = {}): Promise<Response> {
  return fetch(new URL(path, baseUrl()), {
    ...init,
    redirect: "manual",
    headers: {
      Accept: "application/json",
      Cookie: cookieHeader(session),
      ...(init.headers as any),
    },
  });
}

export async function createPost(
  session: Session,
  overrides?: Partial<{ title: string; description: string; category: string; visibility: "public" | "unlisted"; price: string }>,
): Promise<string> {
  const form = new FormData();
  form.set("csrf", session.csrfToken);
  form.set("title", overrides?.title ?? "Test product for a purchasing decision");
  form.set("description", overrides?.description ?? "Considering this for everyday use, want opinions.");
  form.set("category", overrides?.category ?? "computing");
  form.set("visibility", overrides?.visibility ?? "public");
  if (overrides?.price) form.set("price", overrides.price);
  const pngBytes = await testImageBytes();
  form.set("images", new Blob([new Uint8Array(pngBytes)], { type: "image/png" }), "test.png");

  const res = await fetch(new URL("/posts/new", baseUrl()), {
    method: "POST",
    redirect: "manual",
    headers: { Cookie: cookieHeader(session) },
    body: form,
  });
  if (res.status !== 303) {
    throw new Error(`post creation failed: ${res.status} ${await res.text()}`);
  }
  const location = res.headers.get("location")!;
  const match = location.match(/\/posts\/([a-f0-9-]{36})/);
  if (!match) throw new Error(`could not parse post id from redirect: ${location}`);
  return match[1];
}

export async function submitOpinion(session: Session, postId: string, stance: "BUY" | "PASS", comment: string): Promise<Response> {
  return apiCall(session, `/posts/${postId}/opinions`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ csrf: session.csrfToken, stance, comment }),
  });
}

// A real, decodable 200x200 PNG generated on demand — large enough to clear
// images.ts's minimum-dimension validation, used as a stand-in product photo
// across tests. Cached after the first call since every test using it wants
// the same innocuous placeholder.
let cachedTestImage: Buffer | null = null;
export async function testImageBytes(): Promise<Buffer> {
  if (!cachedTestImage) {
    cachedTestImage = await sharp({
      create: { width: 200, height: 200, channels: 3, background: { r: 217, g: 96, b: 59 } },
    })
      .png()
      .toBuffer();
  }
  return cachedTestImage;
}
