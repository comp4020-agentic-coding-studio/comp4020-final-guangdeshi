// Profile, interests, and account settings: a form field repeated for
// multiple checkboxes (`interests`) must collect into a full list, not
// silently keep only the last value — a real bug caught during manual QA
// before this test existed.
import { describe, expect, it } from "vitest";
import { apiCall, baseUrl, cookieHeader, registerUser, testImageBytes } from "./helpers.ts";

describe("profile", () => {
  it("updates display name and bio", async () => {
    const alice = await registerUser();
    const res = await apiCall(alice, "/me/profile", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ csrf: alice.csrfToken, displayName: "Updated Name", bio: "A short bio" }),
    });
    expect(res.status).toBe(303);
    const page = await fetch(new URL(`/u/${alice.handle}`, baseUrl()));
    const html = await page.text();
    expect(html).toContain("Updated Name");
    expect(html).toContain("A short bio");
  });

  it("saves all selected interests, not just the last checkbox", async () => {
    const alice = await registerUser();
    const params = new URLSearchParams();
    params.set("csrf", alice.csrfToken);
    params.append("interests", "computing");
    params.append("interests", "gaming");
    params.append("interests", "audio");

    const res = await apiCall(alice, "/me/interests", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: params,
    });
    expect(res.status).toBe(303);

    const page = await fetch(new URL(`/u/${alice.handle}`, baseUrl()), { headers: { Cookie: cookieHeader(alice) } });
    const html = await page.text();
    for (const id of ["computing", "gaming", "audio"]) {
      expect(html).toMatch(new RegExp(`value="${id}"\\s+checked`));
    }
    expect(html).not.toMatch(/value="photography"\s+checked/);
  });

  it("replaces (not merges) interests on a second save", async () => {
    const alice = await registerUser();
    const first = new URLSearchParams();
    first.set("csrf", alice.csrfToken);
    first.append("interests", "computing");
    await apiCall(alice, "/me/interests", { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: first });

    // Submitting with none selected (no "interests" keys at all) should clear them.
    const second = new URLSearchParams();
    second.set("csrf", alice.csrfToken);
    await apiCall(alice, "/me/interests", { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: second });

    const page = await fetch(new URL(`/u/${alice.handle}`, baseUrl()), { headers: { Cookie: cookieHeader(alice) } });
    const html = await page.text();
    expect(html).not.toMatch(/value="computing"\s+checked/);
  });
});

describe("avatar upload", () => {
  it("uploads and serves a profile avatar photo", async () => {
    const alice = await registerUser();
    const form = new FormData();
    form.set("csrf", alice.csrfToken);
    form.set("displayName", "Avatar Tester");
    form.set("bio", "");
    const bytes = await testImageBytes();
    form.set("avatar", new Blob([new Uint8Array(bytes)], { type: "image/png" }), "avatar.png");

    const res = await fetch(new URL("/me/profile", baseUrl()), {
      method: "POST",
      redirect: "manual",
      headers: { Cookie: cookieHeader(alice) },
      body: form,
    });
    expect(res.status).toBe(303);

    const page = await fetch(new URL(`/u/${alice.handle}`, baseUrl()));
    const html = await page.text();
    const match = html.match(/<img src="(\/images\/[a-f0-9-]{36})"[^>]*profile-avatar-photo/);
    expect(match, "expected the avatar <img> on the profile page").toBeTruthy();

    const imageRes = await fetch(new URL(match![1], baseUrl()));
    expect(imageRes.status).toBe(200);
    expect(imageRes.headers.get("content-type")).toBe("image/jpeg");
  });
});

describe("account settings: password change", () => {
  it("rejects a password change with the wrong current password", async () => {
    const alice = await registerUser();
    const res = await apiCall(alice, "/me/password", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ csrf: alice.csrfToken, currentPassword: "totally-wrong", newPassword: "newpassword456" }),
    });
    expect(res.status).toBe(303);
    const location = res.headers.get("location")!;
    expect(location).toContain("kind=error");
  });

  it("changes the password and invalidates the old one for future logins", async () => {
    const alice = await registerUser();
    const res = await apiCall(alice, "/me/password", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ csrf: alice.csrfToken, currentPassword: "password123", newPassword: "brandnewpassword789" }),
    });
    expect(res.status).toBe(303);
    expect(res.headers.get("location")).toContain("kind=success");

    const oldPasswordLogin = await fetch(new URL("/login", baseUrl()), {
      method: "POST",
      redirect: "manual",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ email: alice.email, password: "password123" }),
    });
    expect(oldPasswordLogin.status).toBe(401);

    const newPasswordLogin = await fetch(new URL("/login", baseUrl()), {
      method: "POST",
      redirect: "manual",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ email: alice.email, password: "brandnewpassword789" }),
    });
    expect(newPasswordLogin.status).toBe(303);
  });
});
