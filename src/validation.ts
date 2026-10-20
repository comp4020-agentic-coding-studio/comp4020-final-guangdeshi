// Shared input validation for posts, opinions, and outcomes. Centralized so
// the same rules apply to every route and spec/api.test.ts can target one
// place when checking a boundary case.
import { getCategoryById } from "./db.ts";

export interface ValidationResult {
  ok: boolean;
  errors: string[];
}

const TITLE_MAX = 120;
const DESCRIPTION_MAX = 2000;
const COMMENT_MAX = 500;
const REFLECTION_MAX = 1000;
const TAG_MAX_LENGTH = 24;
const TAGS_MAX_COUNT = 8;
const CURRENCY_RE = /^[A-Z]{3}$/;

export function validatePostInput(input: {
  title?: unknown;
  description?: unknown;
  priceCents?: unknown;
  currency?: unknown;
  categoryId?: unknown;
  tags?: unknown;
  visibility?: unknown;
}): ValidationResult {
  const errors: string[] = [];

  if (typeof input.title !== "string" || input.title.trim().length === 0) {
    errors.push("title is required");
  } else if (input.title.trim().length > TITLE_MAX) {
    errors.push(`title must be ${TITLE_MAX} characters or fewer`);
  }

  if (typeof input.description !== "string" || input.description.trim().length === 0) {
    errors.push("purchasing context is required");
  } else if (input.description.trim().length > DESCRIPTION_MAX) {
    errors.push(`description must be ${DESCRIPTION_MAX} characters or fewer`);
  }

  if (input.priceCents !== undefined && input.priceCents !== null) {
    const price = Number(input.priceCents);
    if (!Number.isFinite(price) || price < 0 || price > 1_000_000_00) {
      errors.push("price must be a non-negative number");
    }
  }

  if (input.currency !== undefined && input.currency !== null && input.currency !== "") {
    if (typeof input.currency !== "string" || !CURRENCY_RE.test(input.currency)) {
      errors.push("currency must be a 3-letter code, e.g. AUD");
    }
  }

  if (typeof input.categoryId !== "string" || !getCategoryById(input.categoryId)) {
    errors.push("a valid category is required");
  }

  if (input.tags !== undefined) {
    if (!Array.isArray(input.tags)) {
      errors.push("tags must be a list");
    } else if (input.tags.length > TAGS_MAX_COUNT) {
      errors.push(`at most ${TAGS_MAX_COUNT} tags are allowed`);
    } else if (input.tags.some((t) => typeof t !== "string" || t.length === 0 || t.length > TAG_MAX_LENGTH)) {
      errors.push(`each tag must be 1-${TAG_MAX_LENGTH} characters`);
    }
  }

  if (input.visibility !== "public" && input.visibility !== "unlisted") {
    errors.push("visibility must be 'public' or 'unlisted'");
  }

  return { ok: errors.length === 0, errors };
}

export function normalizeTags(tags: unknown): string[] {
  if (!Array.isArray(tags)) return [];
  return Array.from(
    new Set(
      tags
        .filter((t): t is string => typeof t === "string")
        .map((t) => t.trim().toLowerCase())
        .filter((t) => t.length > 0 && t.length <= TAG_MAX_LENGTH),
    ),
  ).slice(0, TAGS_MAX_COUNT);
}

export function validateOpinionInput(input: { stance?: unknown; comment?: unknown }): ValidationResult {
  const errors: string[] = [];
  if (input.stance !== "BUY" && input.stance !== "PASS") {
    errors.push("stance must be 'BUY' or 'PASS'");
  }
  if (typeof input.comment !== "string" || input.comment.trim().length === 0) {
    errors.push("a short comment is required");
  } else if (input.comment.trim().length > COMMENT_MAX) {
    errors.push(`comment must be ${COMMENT_MAX} characters or fewer`);
  }
  return { ok: errors.length === 0, errors };
}

export function validateOutcomeInput(input: { status?: unknown; reflection?: unknown }): ValidationResult {
  const errors: string[] = [];
  if (!["BOUGHT", "DID_NOT_BUY", "STILL_DECIDING"].includes(input.status as string)) {
    errors.push("status must be BOUGHT, DID_NOT_BUY, or STILL_DECIDING");
  }
  if (input.reflection !== undefined && input.reflection !== null) {
    if (typeof input.reflection !== "string" || input.reflection.length > REFLECTION_MAX) {
      errors.push(`reflection must be ${REFLECTION_MAX} characters or fewer`);
    }
  }
  return { ok: errors.length === 0, errors };
}

// Escapes untrusted text for embedding in server-rendered HTML — the XSS
// backstop for every user-authored string (title, description, comment,
// display name, bio, reflection) interpolated into pages.ts templates.
export function escapeHtml(input: string): string {
  return input
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
