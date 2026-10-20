// First-admin provisioning: no credential is baked into the app anywhere.
// ADMIN_BOOTSTRAP_SECRET gates a one-time promotion of an already-registered
// account to admin, and self-disables once any admin exists. These tests
// only cover the "secret is unset" (fails closed) and "wrong secret" cases,
// since the server under test here runs with no ADMIN_BOOTSTRAP_SECRET set
// (see spec/global-setup.ts / package.json's dev:test script) — the
// one-time-promotion-then-self-disable path is exercised manually (see
// docs/architecture/AUTH_AND_PERMISSIONS.md) because flipping a global env
// var mid-suite would affect every other test's server instance.
import { describe, expect, it } from "vitest";
import { apiCall, baseUrl, registerUser } from "./helpers.ts";

describe("admin bootstrap", () => {
  it("fails closed (404) when no bootstrap secret is configured on the server", async () => {
    const alice = await registerUser();
    const res = await apiCall(alice, "/admin/bootstrap", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ secret: "anything-at-all" }),
    });
    expect(res.status).toBe(404);
  });

  it("requires authentication even to attempt it", async () => {
    const res = await fetch(new URL("/admin/bootstrap", baseUrl()), {
      method: "POST",
      redirect: "manual",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ secret: "anything-at-all" }),
    });
    expect(res.status).toBe(401);
  });
});
