// Pure unit tests — no HTTP, no running server required — for the password
// hashing and validation logic that's cheapest and most important to test in
// isolation. Still runs under the same global setup, so a server must be
// reachable at APP_URL for the whole suite to start, even though this file
// never calls fetch.
import { describe, expect, it } from "vitest";
import { hashPassword, verifyPassword, isValidEmail, isValidHandle, isValidPassword } from "../src/auth.ts";
import { validateOpinionInput, validatePostInput, normalizeTags, escapeHtml } from "../src/validation.ts";

describe("password hashing", () => {
  it("hashes never equal the plaintext and verify correctly", () => {
    const hash = hashPassword("correct horse battery staple");
    expect(hash).not.toContain("correct horse battery staple");
    expect(verifyPassword("correct horse battery staple", hash)).toBe(true);
  });

  it("rejects an incorrect password", () => {
    const hash = hashPassword("the-real-password");
    expect(verifyPassword("not-the-real-password", hash)).toBe(false);
  });

  it("produces a different hash (different salt) for the same password each time", () => {
    const a = hashPassword("same-password-123");
    const b = hashPassword("same-password-123");
    expect(a).not.toBe(b);
    expect(verifyPassword("same-password-123", a)).toBe(true);
    expect(verifyPassword("same-password-123", b)).toBe(true);
  });

  it("encodes algorithm and parameters alongside the hash", () => {
    const hash = hashPassword("whatever");
    expect(hash.startsWith("scrypt$N=")).toBe(true);
  });

  it("rejects malformed stored hashes rather than throwing", () => {
    expect(verifyPassword("anything", "not-a-real-hash")).toBe(false);
  });
});

describe("email/handle/password validation", () => {
  it("accepts well-formed emails and rejects malformed ones", () => {
    expect(isValidEmail("person@example.com")).toBe(true);
    expect(isValidEmail("not-an-email")).toBe(false);
    expect(isValidEmail("missing@domain")).toBe(false);
    expect(isValidEmail("@example.com")).toBe(false);
  });

  it("accepts well-formed handles and rejects malformed ones", () => {
    expect(isValidHandle("alice")).toBe(true);
    expect(isValidHandle("alice_the-2nd")).toBe(true);
    expect(isValidHandle("al")).toBe(false); // too short
    expect(isValidHandle("Alice")).toBe(false); // must be lowercase
    expect(isValidHandle("has spaces")).toBe(false);
  });

  it("enforces a minimum password length", () => {
    expect(isValidPassword("short")).toBe(false);
    expect(isValidPassword("longenough123")).toBe(true);
  });
});

describe("post input validation", () => {
  it("requires a title, description, and valid category", () => {
    const result = validatePostInput({ title: "", description: "", categoryId: "not-a-real-category", visibility: "public" });
    expect(result.ok).toBe(false);
    expect(result.errors.length).toBeGreaterThan(0);
  });

  it("accepts a fully valid post input", () => {
    const result = validatePostInput({
      title: "A reasonable title",
      description: "A reasonable description of why I want this.",
      categoryId: "computing",
      visibility: "public",
      tags: ["dev", "ai"],
    });
    expect(result.ok).toBe(true);
  });

  it("rejects an invalid visibility value", () => {
    const result = validatePostInput({
      title: "Title",
      description: "Description text here",
      categoryId: "computing",
      visibility: "private", // not a real option — only public/unlisted
    });
    expect(result.ok).toBe(false);
  });
});

describe("opinion input validation", () => {
  it("requires stance to be BUY or PASS", () => {
    expect(validateOpinionInput({ stance: "BUY", comment: "ok" }).ok).toBe(true);
    expect(validateOpinionInput({ stance: "PASS", comment: "ok" }).ok).toBe(true);
    expect(validateOpinionInput({ stance: "MAYBE", comment: "ok" }).ok).toBe(false);
  });

  it("requires a non-empty comment", () => {
    expect(validateOpinionInput({ stance: "BUY", comment: "" }).ok).toBe(false);
    expect(validateOpinionInput({ stance: "BUY", comment: "   " }).ok).toBe(false);
  });
});

describe("tag normalization", () => {
  it("lowercases, trims, dedupes, and caps tag count", () => {
    const tags = normalizeTags(["  Dev ", "dev", "AI", "ai", "a", "b", "c", "d", "e", "f", "g", "h", "i"]);
    expect(tags).toContain("dev");
    expect(tags).toContain("ai");
    expect(new Set(tags).size).toBe(tags.length);
    expect(tags.length).toBeLessThanOrEqual(8);
  });
});

describe("XSS escaping", () => {
  it("escapes HTML-significant characters", () => {
    const escaped = escapeHtml(`<script>alert('xss')</script>`);
    expect(escaped).not.toContain("<script>");
    expect(escaped).toContain("&lt;script&gt;");
  });
});
