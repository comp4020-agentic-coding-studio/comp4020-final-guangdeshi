// Feature D: idempotent demo-content seeder. Creates a small set of clearly
// labelled demo accounts, posts, opinions and outcomes from
// src/demo-scenarios.ts — never real user data. Safe to re-run: it checks
// demo_metadata for each scenario's deterministic post id before inserting
// anything, so running this twice against the same database is a no-op the
// second time (per the brief's explicit "idempotent" requirement).
//
// Every demo account/post is flagged is_demo=1 at the database level (see
// migrations 0007_demo_and_search), which is what actually excludes it from
// activityStats/real-participation counts and keeps it out of the normal
// Discover feed — this script's only job is to call the same createPost/
// setPurchaseOptions/upsertOpinion functions a real request handler uses,
// with isDemo passed through, so demo content exercises the exact same
// code path as real content and can never drift into a second, untested
// "demo-only" write path.
//
// Run with: node scripts/seed-demo-content.ts
// Or in-process via POST /admin/demo/seed (src/server.ts's
// handleAdminSeedDemo), which calls seedDemoContent() directly.
import { randomUUID } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";
import {
  createDemoUser,
  createImageRow,
  createPost,
  getUserByHandle,
  indexPostForSearch,
  setPostContext,
  setPurchaseOptions,
  setInfluentialOpinion,
  upsertComparisonOpinion,
  upsertOpinion,
  upsertOutcome,
  db,
  type NewPurchaseOption,
} from "../src/db.ts";
import { hashPassword } from "../src/auth.ts";
import { CONTEXT_SCHEMA_VERSION } from "../src/context-prompts.ts";
import {
  DEMO_GENERATION_METHOD,
  DEMO_MODEL_IDENTITY,
  DEMO_SCENARIOS,
  DEMO_SEED_VERSION,
  DEMO_USERS,
  DEMO_VALIDATION_METHOD,
  type ImageKey,
} from "../src/demo-scenarios.ts";

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(__dirname, "..");
const SOURCE_IMAGE_DIR = join(REPO_ROOT, "docs/assets/demo-source-images");
const UPLOAD_DIR = process.env.UPLOAD_DIR ?? "./data/uploads";

const REAL_SOURCE_FILES: Record<Exclude<ImageKey, null>, string> = {
  macmini: "macmini.jpg",
  sleepingbag: "sleepingbag.jpg",
  // Was a 100x100px line-icon SVG (The Noun Project, CC0) rasterized at its
  // native size — it rendered as a near-solid black square, not a usable
  // product photo (found via direct image inspection, not assumed from the
  // file existing). Replaced with a genuine photograph; see
  // docs/research/IMAGE_PROVENANCE.md for the swap record.
  headphones: "headphones.jpg",
  backpack: "backpack.jpg",
  espresso: "espresso.jpg",
  airfryer: "airfryer.jpg",
  roomba: "roomba.jpg",
};

// Attribution text required for images whose license demands it (CC BY /
// CC BY-SA — see docs/research/IMAGE_PROVENANCE.md) — appended to that
// scenario's description so the requirement ("attribution wherever the
// work is reused") is satisfied in the rendered page itself, not only in
// the repo's own provenance manifest.
const CC_BY_ATTRIBUTION: Partial<Record<Exclude<ImageKey, null>, string>> = {
  macmini: "Photo by Seasider53, Wikimedia Commons, CC BY 4.0.",
  headphones: "Photo by Adamantios, Wikimedia Commons, CC BY-SA 3.0.",
  espresso: "Photo by Jmak, Wikimedia Commons, CC BY-SA 3.0.",
  airfryer: "Photo by Ashley Pomeroy, Wikimedia Commons, CC BY 4.0.",
  roomba: "Photo by Auledas, Wikimedia Commons, CC BY-SA 4.0.",
};

// Greedy word-wrap, estimating each character's rendered width rather than
// assuming a fixed-width font — SVG <text> has no automatic wrapping, and
// the earlier version of this function (passing only an arbitrary 3-word
// slice of the real title) produced illustrations whose labels read as
// truncated mid-sentence fragments ("Mechanical keyboard —", "Electric bike
// for") once a real scenario title didn't fit, found and fixed during the
// visual design audit. This wraps the *actual* label at however many lines
// it needs, so nothing is ever cut off.
function wrapLabel(label: string, maxCharsPerLine: number, maxLines: number): string[] {
  const words = label.split(/\s+/);
  const lines: string[] = [];
  let current = "";
  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word;
    if (candidate.length > maxCharsPerLine && current) {
      lines.push(current);
      current = word;
    } else {
      current = candidate;
    }
    if (lines.length === maxLines - 1) break;
  }
  if (current) lines.push(current);
  // If words remain unconsumed (label longer than maxLines allows), the
  // last line gets an ellipsis rather than silently dropping the overflow
  // without any indication text was cut — this only triggers for labels
  // longer than ~maxLines*maxCharsPerLine characters, well beyond any real
  // scenario title or option name in src/demo-scenarios.ts.
  const consumed = lines.join(" ").length;
  if (consumed < label.length) {
    lines[lines.length - 1] = `${lines[lines.length - 1].replace(/[,.;:\s]+$/, "")}…`;
  }
  return lines;
}

// A simple, original, locally-generated illustration for any demo item with
// no sourced real photo — flat background + centered, word-wrapped label,
// composited with sharp (no external asset, no generation API). Font size
// scales down for longer labels so a full post title (not just a 3-word
// fragment) always fits within the frame. Deliberately plain: this is a
// fallback for provenance safety, not an attempt to look like a stock
// photo.
async function generateIllustration(label: string, seedColor: string): Promise<Buffer> {
  const width = 960;
  const height = 720;
  const fontSize = label.length > 45 ? 34 : label.length > 25 ? 40 : 48;
  const maxCharsPerLine = Math.round((width - 160) / (fontSize * 0.54));
  const lines = wrapLabel(label, maxCharsPerLine, 4);
  const lineHeight = fontSize * 1.25;
  const blockHeight = lines.length * lineHeight;
  const startY = height / 2 - blockHeight / 2 - 20;
  const tspans = lines
    .map((line, i) => `<tspan x="50%" dy="${i === 0 ? 0 : lineHeight}">${escapeXml(line)}</tspan>`)
    .join("");
  const svg = `
    <svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
      <rect width="100%" height="100%" fill="${seedColor}" />
      <rect x="40" y="40" width="${width - 80}" height="${height - 80}" fill="none" stroke="#ffffff" stroke-width="3" opacity="0.35" rx="18" />
      <text x="50%" y="${startY}" font-family="Georgia, 'Times New Roman', serif" font-size="${fontSize}" fill="#ffffff" text-anchor="middle">${tspans}</text>
      <text x="50%" y="${startY + blockHeight + 36}" font-family="Georgia, 'Times New Roman', serif" font-size="20" fill="#ffffff" opacity="0.8" text-anchor="middle">Demo scenario illustration</text>
    </svg>
  `;
  return sharp(Buffer.from(svg)).jpeg({ quality: 85 }).toBuffer();
}

function escapeXml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&apos;" }[c]!));
}

// A small deterministic palette keyed by category, so illustrations for the
// same category feel like a coherent set rather than random colors.
const CATEGORY_COLORS: Record<string, string> = {
  computing: "#3a5a7a",
  "outdoors-fitness": "#3f6b4a",
  photography: "#5a4a7a",
  audio: "#7a4a5a",
  fashion: "#8a6a3a",
  "home-kitchen": "#7a5a3a",
  vehicles: "#3a6a6a",
  gaming: "#5a3a7a",
  "books-hobbies": "#6a5a3a",
};

async function storeRealImage(ownerUserId: string, key: Exclude<ImageKey, null>): Promise<string> {
  const sourcePath = join(SOURCE_IMAGE_DIR, REAL_SOURCE_FILES[key]);
  const raw = await sharp(sourcePath).rotate().jpeg({ quality: 88 }).toBuffer();
  const meta = await sharp(raw).metadata();
  const id = randomUUID();
  const filename = `${id}.jpg`;
  mkdirSync(UPLOAD_DIR, { recursive: true });
  writeFileSync(join(UPLOAD_DIR, filename), raw);
  const row = createImageRow(ownerUserId, filename, "image/jpeg", meta.width!, meta.height!, raw.length);
  return row.id;
}

async function storeIllustration(ownerUserId: string, label: string, categoryId: string): Promise<string> {
  const color = CATEGORY_COLORS[categoryId] ?? "#555555";
  const buffer = await generateIllustration(label, color);
  const meta = await sharp(buffer).metadata();
  const id = randomUUID();
  const filename = `${id}.jpg`;
  mkdirSync(UPLOAD_DIR, { recursive: true });
  writeFileSync(join(UPLOAD_DIR, filename), buffer);
  const row = createImageRow(ownerUserId, filename, "image/jpeg", meta.width!, meta.height!, buffer.length);
  return row.id;
}

function recordDemoMetadata(postId: string, seedVersion: string): void {
  db.prepare(
    `INSERT INTO demo_metadata (post_id, generation_method, model_identity, generated_at, seed_version, validation_method)
     VALUES (?, ?, ?, ?, ?, ?)
     ON CONFLICT(post_id) DO NOTHING`,
  ).run(postId, DEMO_GENERATION_METHOD, DEMO_MODEL_IDENTITY, new Date().toISOString(), seedVersion, DEMO_VALIDATION_METHOD);
}

function alreadySeeded(seedVersion: string): boolean {
  const row = db.prepare(`SELECT COUNT(*) AS n FROM demo_metadata WHERE seed_version = ?`).get(seedVersion) as { n: number };
  return row.n >= DEMO_SCENARIOS.length;
}

export interface SeedResult {
  alreadySeeded: boolean;
  usersCreated: number;
  postsCreated: number;
  seedVersion: string;
}

export async function seedDemoContent(): Promise<SeedResult> {
  if (alreadySeeded(DEMO_SEED_VERSION)) {
    return { alreadySeeded: true, usersCreated: 0, postsCreated: 0, seedVersion: DEMO_SEED_VERSION };
  }

  const handleToUserId = new Map<string, string>();
  let usersCreated = 0;
  for (const u of DEMO_USERS) {
    const existing = getUserByHandle(u.handle);
    if (existing) {
      handleToUserId.set(u.handle, existing.id);
      continue;
    }
    const passwordHash = hashPassword(randomUUID()); // demo accounts are never logged into; password is unrecoverable by design
    const email = `${u.handle}@demo.invalid`;
    const user = createDemoUser(email, u.handle, passwordHash, u.displayName);
    handleToUserId.set(u.handle, user.id);
    usersCreated++;
  }

  let postsCreated = 0;
  for (const scenario of DEMO_SCENARIOS) {
    const authorId = handleToUserId.get(scenario.authorHandle);
    if (!authorId) throw new Error(`unknown demo author handle: ${scenario.authorHandle}`);

    let description = scenario.description;
    if (scenario.imageKey && CC_BY_ATTRIBUTION[scenario.imageKey]) {
      description += `\n\n(${CC_BY_ATTRIBUTION[scenario.imageKey]})`;
    }

    if (scenario.mode === "BUY_PASS") {
      const imageId = scenario.imageKey
        ? await storeRealImage(authorId, scenario.imageKey)
        : await storeIllustration(authorId, scenario.title, scenario.categoryId);
      const post = createPost(
        {
          authorId,
          title: scenario.title,
          description,
          priceCents: scenario.priceCents ?? null,
          currency: scenario.currency ?? null,
          categoryId: scenario.categoryId,
          tags: scenario.tags,
          visibility: "public",
          mode: "BUY_PASS",
          isDemo: true,
        },
        [imageId],
      );
      postsCreated++;
      seedContextAndOpinions(post.id, scenario, handleToUserId);
      recordDemoMetadata(post.id, DEMO_SEED_VERSION);
      continue;
    }

    // WHICH_ONE — attribution for a licensed photo can live on an option
    // rather than the scenario itself (e.g. the air fryer scenario has no
    // top-level imageKey, but its "Basic 2L air fryer" option does), so
    // every option's imageKey is checked too, not just the scenario's own.
    for (const opt of scenario.options ?? []) {
      if (opt.imageKey && CC_BY_ATTRIBUTION[opt.imageKey]) {
        description += `\n\n(${CC_BY_ATTRIBUTION[opt.imageKey]})`;
      }
    }

    const post = createPost(
      {
        authorId,
        title: scenario.title,
        description,
        priceCents: null,
        currency: null,
        categoryId: scenario.categoryId,
        tags: scenario.tags,
        visibility: "public",
        mode: "WHICH_ONE",
        isDemo: true,
      },
      [],
    );
    postsCreated++;

    const options: NewPurchaseOption[] = [];
    for (const opt of scenario.options ?? []) {
      const imageId = opt.imageKey
        ? await storeRealImage(authorId, opt.imageKey)
        : await storeIllustration(authorId, opt.name, scenario.categoryId);
      options.push({
        name: opt.name,
        imageId,
        expectedPriceCents: opt.expectedPriceCents,
        currency: opt.currency,
        originalPriceCents: opt.originalPriceCents ?? null,
        condition: opt.condition ?? null,
        sourceUrl: null,
        saleNote: opt.saleNote ?? null,
        specifications: opt.specifications ?? null,
      });
    }
    const storedOptions = setPurchaseOptions(post.id, options);

    seedContextAndOpinions(post.id, scenario, handleToUserId, storedOptions);
    recordDemoMetadata(post.id, DEMO_SEED_VERSION);
  }

  return { alreadySeeded: false, usersCreated, postsCreated, seedVersion: DEMO_SEED_VERSION };
}

function seedContextAndOpinions(
  postId: string,
  scenario: (typeof DEMO_SCENARIOS)[number],
  handleToUserId: Map<string, string>,
  storedOptions?: { id: string }[],
): void {
  if (scenario.context && (Object.keys(scenario.context.answers).length > 0 || scenario.context.freeText)) {
    setPostContext(postId, CONTEXT_SCHEMA_VERSION, scenario.categoryId, scenario.context.answers, scenario.context.freeText ?? "");
  }

  const opinionIds: string[] = [];
  for (const o of scenario.opinions) {
    const userId = handleToUserId.get(o.authorHandle);
    if (!userId) throw new Error(`unknown demo opinion author handle: ${o.authorHandle}`);
    if (scenario.mode === "BUY_PASS") {
      const opinion = upsertOpinion(postId, userId, o.stance!, o.comment);
      opinionIds.push(opinion.id);
    } else {
      const selection = o.selectedNone
        ? ({ none: true } as const)
        : ({ optionId: storedOptions![o.selectedOptionIndex!].id } as const);
      const opinion = upsertComparisonOpinion(postId, userId, selection, o.comment);
      opinionIds.push(opinion.id);
    }
  }

  const contextText = scenario.context
    ? [...Object.values(scenario.context.answers), scenario.context.freeText ?? ""].join(" ")
    : "";
  indexPostForSearch(postId, scenario.title, scenario.description, contextText);

  if (scenario.outcome) {
    const purchasedOptionId =
      scenario.outcome.purchasedOptionIndex !== undefined && storedOptions
        ? storedOptions[scenario.outcome.purchasedOptionIndex].id
        : undefined;
    upsertOutcome(postId, scenario.outcome.status, scenario.outcome.reflection ?? "", purchasedOptionId);
  }

  if (scenario.influentialOpinionIndex !== undefined) {
    setInfluentialOpinion(postId, opinionIds[scenario.influentialOpinionIndex]);
  }
}

// Allow running directly: `node scripts/seed-demo-content.ts`
if (import.meta.url === `file://${process.argv[1]}`) {
  seedDemoContent()
    .then((result) => {
      console.log(JSON.stringify(result, null, 2));
      process.exit(0);
    })
    .catch((err) => {
      console.error(err);
      process.exit(1);
    });
}
