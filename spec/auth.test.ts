// TEST A/B from the brief: registration, logout, and re-login must actually
// work against the real server, not just render a form.
import { describe, expect, it } from "vitest";
import { apiCall, baseUrl, cookieHeader, registerUser } from "./helpers.ts";

describe("registration", () => {
  it("creates a real account and immediately logs the user in", async () => {
    const session = await registerUser();
    const res = await fetch(new URL("/me/activity", baseUrl()), {
      headers: { Cookie: cookieHeader(session) },
    });
    expect(res.status).toBe(200);
  });

  it("rejects a duplicate email", async () => {
    const session = await registerUser();
    const res = await fetch(new URL("/register", baseUrl()), {
      method: "POST",
      redirect: "manual",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        email: session.email,
        handle: `other${Date.now()}`,
        displayName: "Someone else",
        password: "password123",
      }),
    });
    expect(res.status).toBe(400);
  });

  it("rejects a duplicate handle", async () => {
    const session = await registerUser();
    const res = await fetch(new URL("/register", baseUrl()), {
      method: "POST",
      redirect: "manual",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        email: `other${Date.now()}@example.com`,
        handle: session.handle,
        displayName: "Someone else",
        password: "password123",
      }),
    });
    expect(res.status).toBe(400);
  });

  it("rejects a short password", async () => {
    const res = await fetch(new URL("/register", baseUrl()), {
      method: "POST",
      redirect: "manual",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        email: `shortpw${Date.now()}@example.com`,
        handle: `shortpw${Date.now()}`,
        displayName: "Short Pw",
        password: "short",
      }),
    });
    expect(res.status).toBe(400);
  });

  it("never returns the password hash in any response", async () => {
    const session = await registerUser();
    const res = await fetch(new URL(`/u/${session.handle}`, baseUrl()), { headers: { Cookie: cookieHeader(session) } });
    const html = await res.text();
    expect(html).not.toContain("scrypt$");
  });
});

describe("login and logout", () => {
  it("logs in with correct credentials and rejects wrong ones", async () => {
    const session = await registerUser();

    const wrongPassword = await fetch(new URL("/login", baseUrl()), {
      method: "POST",
      redirect: "manual",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ email: session.email, password: "wrong-password" }),
    });
    expect(wrongPassword.status).toBe(401);

    const correctPassword = await fetch(new URL("/login", baseUrl()), {
      method: "POST",
      redirect: "manual",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ email: session.email, password: "password123" }),
    });
    expect(correctPassword.status).toBe(303);
  });

  it("logs out and invalidates the session so protected routes 401 again", async () => {
    const session = await registerUser();
    const before = await apiCall(session, "/me/activity");
    expect(before.status).toBe(200);

    await apiCall(session, "/logout", { method: "POST", body: new URLSearchParams({ csrf: session.csrfToken }), headers: { "Content-Type": "application/x-www-form-urlencoded" } });

    const after = await apiCall(session, "/me/activity");
    expect(after.status).toBe(401);
  });

  it("rejects a nonexistent email with the same status as a wrong password (no user enumeration via status code)", async () => {
    const nonexistent = await fetch(new URL("/login", baseUrl()), {
      method: "POST",
      redirect: "manual",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ email: `nobody${Date.now()}@example.com`, password: "whatever123" }),
    });
    expect(nonexistent.status).toBe(401);
  });
});

describe("CSRF protection", () => {
  it("rejects a mutating POST with no CSRF token", async () => {
    const session = await registerUser();
    const res = await apiCall(session, "/me/profile", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ displayName: "No CSRF Attempt" }),
    });
    expect(res.status).toBe(403);
  });

  it("rejects a mutating POST with another session's CSRF token", async () => {
    const alice = await registerUser();
    const bob = await registerUser();
    const res = await apiCall(alice, "/me/profile", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ displayName: "Cross session CSRF", csrf: bob.csrfToken }),
    });
    expect(res.status).toBe(403);
  });
});

describe("session boundaries", () => {
  it("rejects protected routes with no session cookie at all", async () => {
    const res = await fetch(new URL("/me/activity", baseUrl()));
    expect(res.status).toBe(401);
  });

  it("rejects a forged/garbage session cookie", async () => {
    const res = await fetch(new URL("/me/activity", baseUrl()), {
      headers: { Cookie: "bop_session=not-a-real-session-token" },
    });
    expect(res.status).toBe(401);
  });
});
