// Feature A (Adaptive Purchasing Context): a small, versioned, data-driven
// config mapping a category (or a more specific subtype within it) to up to
// three optional prompts. Pure data — no database table, no admin UI to
// manage it — because the brief's own worked examples (computing, outdoor
// gear, photography, fashion, audio, sleeping bags specifically) are a
// fixed, small, author-curated set, not something a user ever creates or
// edits. Adding a category's prompts is a one-time code change here, the
// same way adding a new src/migrations.ts entry is a one-time schema
// change — both are reviewed, versioned, and shipped together.
//
// CONTEXT_SCHEMA_VERSION bumps whenever a prompt's *key* changes meaning
// (not when wording is merely reworded) — stored alongside each answer set
// in post_context.schema_version, so a future prompt redesign can tell old
// answers apart from new ones without guessing from content.
export const CONTEXT_SCHEMA_VERSION = 1;

export interface ContextPrompt {
  key: string;
  label: string;
  placeholder?: string;
}

interface CategoryPrompts {
  prompts: ContextPrompt[];
  // Optional subtype overrides, keyed by a free-text subtype the poster
  // picks (e.g. "sleeping-bag" within "outdoors-fitness") — checked before
  // falling back to the category's own prompts. Subtypes are suggestions in
  // the UI (a datalist), not a separate schema table, so a buyer typing an
  // unrecognized subtype just gets the parent category's prompts.
  subtypes?: Record<string, ContextPrompt[]>;
}

const CATEGORY_PROMPTS: Record<string, CategoryPrompts> = {
  computing: {
    prompts: [
      { key: "current_device", label: "What device do you currently have?", placeholder: "e.g. 2019 Intel MacBook Pro" },
      { key: "intended_use", label: "What will you use the new device for?", placeholder: "e.g. local LLM inference, video editing" },
      { key: "biggest_concern", label: "What is your biggest concern?", placeholder: "e.g. whether 16GB RAM is enough" },
    ],
  },
  "outdoors-fitness": {
    prompts: [
      { key: "current_equipment", label: "What equipment do you currently own?", placeholder: "e.g. a 10-year-old 3-season bag" },
      { key: "frequency", label: "How frequently will you use this?", placeholder: "e.g. 2-3 overnight trips a year" },
      { key: "conditions", label: "What conditions will you encounter?", placeholder: "e.g. alpine, down to -5°C" },
    ],
    subtypes: {
      "sleeping-bag": [
        { key: "current_equipment", label: "What sleeping bag (and pad) do you currently own?", placeholder: "e.g. a 20-year-old synthetic 3-season bag, no pad" },
        { key: "frequency", label: "How often do you hike or camp overnight?", placeholder: "e.g. a few trips a year, one big trip planned" },
        { key: "conditions", label: "What overnight temperatures do you expect?", placeholder: "e.g. lows around -5°C on the trip I'm planning for" },
      ],
    },
  },
  photography: {
    prompts: [
      { key: "current_gear", label: "What camera or lenses do you currently own?", placeholder: "e.g. a Sony a6400 with the kit lens" },
      { key: "primary_subject", label: "What do you primarily photograph?", placeholder: "e.g. portraits, landscapes, sport" },
      { key: "priority", label: "What matters most for this upgrade?", placeholder: "e.g. low-light performance" },
    ],
  },
  fashion: {
    prompts: [
      { key: "occasion", label: "When and where will you wear it?", placeholder: "e.g. daily commute, a wedding in summer" },
      { key: "existing_similar", label: "Do you already own something similar?", placeholder: "e.g. one older pair that's worn out" },
      { key: "biggest_concern", label: "What is your main concern?", placeholder: "e.g. whether the sizing runs small" },
    ],
  },
  audio: {
    prompts: [
      { key: "current_gear", label: "What do you use now?", placeholder: "e.g. wired earbuds from 2018" },
      { key: "use_context", label: "Where will you listen or use the device?", placeholder: "e.g. open-plan office, daily commute" },
      { key: "priority", label: "What matters most: sound, comfort, isolation or price?", placeholder: "e.g. noise isolation on public transport" },
    ],
  },
};

// Every other category (gaming, home-kitchen, vehicles, books-hobbies,
// other) uses this general fallback rather than having no prompts at all —
// per the brief's own "GENERAL" example set.
const GENERAL_PROMPTS: ContextPrompt[] = [
  { key: "current_equipment", label: "What do you have now?", placeholder: "e.g. nothing, or an older/cheaper version" },
  { key: "intended_use", label: "What will you use it for?", placeholder: "" },
  { key: "biggest_concern", label: "What makes you hesitate?", placeholder: "e.g. the price, or whether you'll actually use it" },
];

/**
 * Looks up the right prompt set for a post: subtype override (if the
 * category has one and the caller supplied a matching subtype), else the
 * category's own prompts, else the general fallback. Never more than 3
 * prompts, per the brief's explicit "no exhaustive questionnaire" rule —
 * enforced here at the single source of truth, not re-checked at every
 * call site.
 */
export function getContextPrompts(categoryId: string, subtype?: string | null): ContextPrompt[] {
  const category = CATEGORY_PROMPTS[categoryId];
  if (category?.subtypes && subtype && category.subtypes[subtype]) {
    return category.subtypes[subtype].slice(0, 3);
  }
  if (category) return category.prompts.slice(0, 3);
  return GENERAL_PROMPTS.slice(0, 3);
}

/** Subtype suggestions for a category, for the create-post form's datalist. Empty for categories with no subtype overrides defined. */
export function getSubtypeSuggestions(categoryId: string): string[] {
  const category = CATEGORY_PROMPTS[categoryId];
  return category?.subtypes ? Object.keys(category.subtypes) : [];
}
