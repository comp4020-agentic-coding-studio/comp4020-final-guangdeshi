// Shared input validation for posts, opinions, and outcomes. Centralized so
// the same rules apply to every route and spec/api.test.ts can target one
// place when checking a boundary case.
import { getCategoryById } from "./db.ts";
import { getContextPrompts } from "./context-prompts.ts";

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

// ------------------------------------------------- v2.0: WHICH_ONE mode --

const OPTION_NAME_MAX = 80;
const MIN_OPTIONS = 2;
const MAX_OPTIONS = 4;
const SPEC_KEY_MAX = 40;
const SPEC_VALUE_MAX = 200;
const MAX_SPEC_ENTRIES = 8;
const CONDITION_MAX = 60;
const SALE_NOTE_MAX = 120;
const SOURCE_URL_MAX = 500;

export interface PurchaseOptionInput {
  name?: unknown;
  expectedPriceCents?: unknown;
  currency?: unknown;
  originalPriceCents?: unknown;
  condition?: unknown;
  sourceUrl?: unknown;
  saleNote?: unknown;
  specifications?: unknown;
}

/** Validates one candidate product in a WHICH_ONE post. Optional fields (brief §8) are only ever rendered if actually supplied — validated here as "absent is fine, present-but-wrong is not." */
export function validatePurchaseOptionInput(input: PurchaseOptionInput, index: number): ValidationResult {
  const errors: string[] = [];
  const label = `option ${index + 1}`;

  if (typeof input.name !== "string" || input.name.trim().length === 0) {
    errors.push(`${label}: a name is required`);
  } else if (input.name.trim().length > OPTION_NAME_MAX) {
    errors.push(`${label}: name must be ${OPTION_NAME_MAX} characters or fewer`);
  }

  const price = Number(input.expectedPriceCents);
  if (!Number.isFinite(price) || price < 0 || price > 1_000_000_00) {
    errors.push(`${label}: expected price must be a non-negative number`);
  }

  if (typeof input.currency !== "string" || !CURRENCY_RE.test(input.currency)) {
    errors.push(`${label}: currency must be a 3-letter code, e.g. AUD`);
  }

  if (input.originalPriceCents !== undefined && input.originalPriceCents !== null && input.originalPriceCents !== "") {
    const original = Number(input.originalPriceCents);
    if (!Number.isFinite(original) || original < 0 || original > 1_000_000_00) {
      errors.push(`${label}: original price must be a non-negative number`);
    }
  }

  if (input.condition !== undefined && input.condition !== null && input.condition !== "") {
    if (typeof input.condition !== "string" || input.condition.length > CONDITION_MAX) {
      errors.push(`${label}: condition must be ${CONDITION_MAX} characters or fewer`);
    }
  }

  if (input.sourceUrl !== undefined && input.sourceUrl !== null && input.sourceUrl !== "") {
    if (typeof input.sourceUrl !== "string" || input.sourceUrl.length > SOURCE_URL_MAX) {
      errors.push(`${label}: source link must be ${SOURCE_URL_MAX} characters or fewer`);
    } else if (!/^https?:\/\//i.test(input.sourceUrl)) {
      errors.push(`${label}: source link must start with http:// or https://`);
    }
  }

  if (input.saleNote !== undefined && input.saleNote !== null && input.saleNote !== "") {
    if (typeof input.saleNote !== "string" || input.saleNote.length > SALE_NOTE_MAX) {
      errors.push(`${label}: sale note must be ${SALE_NOTE_MAX} characters or fewer`);
    }
  }

  if (input.specifications && typeof input.specifications === "object") {
    const entries = Object.entries(input.specifications as Record<string, unknown>);
    if (entries.length > MAX_SPEC_ENTRIES) {
      errors.push(`${label}: at most ${MAX_SPEC_ENTRIES} specification rows are allowed`);
    }
    for (const [k, v] of entries) {
      if (k.length > SPEC_KEY_MAX || typeof v !== "string" || v.length > SPEC_VALUE_MAX) {
        errors.push(`${label}: each specification must be a short label and value`);
        break;
      }
    }
  }

  return { ok: errors.length === 0, errors };
}

export function validatePurchaseOptionCount(count: number): ValidationResult {
  if (count < MIN_OPTIONS || count > MAX_OPTIONS) {
    return { ok: false, errors: [`a comparison post needs ${MIN_OPTIONS}-${MAX_OPTIONS} options (got ${count})`] };
  }
  return { ok: true, errors: [] };
}

/**
 * The comparison-mode equivalent of validateOpinionInput: exactly one of
 * {a valid option id belonging to this post} or {explicit "none"}. The
 * cross-post-option-id check (does this id actually belong to this post?)
 * happens in src/server.ts, since it needs a database lookup this pure
 * function deliberately doesn't do.
 */
export function validateComparisonOpinionInput(input: { selectedOptionId?: unknown; comment?: unknown }): ValidationResult {
  const errors: string[] = [];
  if (typeof input.selectedOptionId !== "string" || input.selectedOptionId.trim().length === 0) {
    errors.push("a selection is required");
  }
  if (typeof input.comment !== "string" || input.comment.trim().length === 0) {
    errors.push("a short comment is required");
  } else if (input.comment.trim().length > COMMENT_MAX) {
    errors.push(`comment must be ${COMMENT_MAX} characters or fewer`);
  }
  return { ok: errors.length === 0, errors };
}

// ------------------------------------------------- v2.0: context prompts -

const CONTEXT_ANSWER_MAX = 200;
const CONTEXT_FREE_TEXT_MAX = 500;

/**
 * Every answer key must be one of the category's own defined prompt keys
 * (brief: "category changes do not silently mislabel existing answers") —
 * an answer under an unrecognized key is rejected outright rather than
 * silently stored and later rendered under the wrong label.
 */
export function validateContextAnswers(
  categoryId: string,
  subtype: string | null,
  answers: Record<string, unknown>,
  freeText: unknown,
): ValidationResult {
  const errors: string[] = [];
  const validKeys = new Set(getContextPrompts(categoryId, subtype).map((p) => p.key));

  for (const [key, value] of Object.entries(answers)) {
    if (!validKeys.has(key)) {
      errors.push(`"${key}" is not a recognized context prompt for this category`);
      continue;
    }
    if (typeof value !== "string" || value.length > CONTEXT_ANSWER_MAX) {
      errors.push(`context answers must be ${CONTEXT_ANSWER_MAX} characters or fewer`);
    }
  }

  if (freeText !== undefined && freeText !== null && freeText !== "") {
    if (typeof freeText !== "string" || freeText.length > CONTEXT_FREE_TEXT_MAX) {
      errors.push(`additional details must be ${CONTEXT_FREE_TEXT_MAX} characters or fewer`);
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
