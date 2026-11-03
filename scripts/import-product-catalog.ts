// Imports the curated real product catalog.
//
//   node scripts/import-product-catalog.ts                # build manifest + images
//   node scripts/import-product-catalog.ts --apply        # ...and sync into DATABASE_PATH now
//
// Input: data-sources/abo-catalog-selection.json — a hand-curated subset of
// the Amazon Berkeley Objects dataset (CC BY 4.0, credit Amazon.com), each
// entry chosen by reading its real listing record and visually checking its
// real catalog photo. Display names are shortened forms of the original
// titles; the original title is always kept.
//
// For each entry this script:
//   1. validates the category against the app's real category list;
//   2. downloads ONLY that product's original catalog image from the
//      official ABO S3 bucket (never the 110GB archive);
//   3. decodes it with sharp and rejects anything that fails to decode,
//      doesn't match the dataset's recorded dimensions, or is too small;
//   4. writes an optimized 1200px JPEG to src/public/catalog/ (metadata
//      stripped, aspect ratio preserved, never upscaled);
//   5. records provenance (source image id + URL, original dimensions) in
//      src/catalog-manifest.json.
// Images already present locally are reused, so re-running is cheap and
// idempotent. It never touches posts, opinions or users; applying the
// manifest is an upsert keyed on a stable id (see src/catalog.ts).
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";
import type { CatalogManifest, ManifestProduct } from "../src/catalog.ts";

const REPO = join(dirname(fileURLToPath(import.meta.url)), "..");
const SELECTION = join(REPO, "data-sources/abo-catalog-selection.json");
const OUT_DIR = join(REPO, "src/public/catalog");
const MANIFEST = join(REPO, "src/catalog-manifest.json");
const ABO_ORIGINAL = "https://amazon-berkeley-objects.s3.amazonaws.com/images/original/";
const VALID_CATEGORIES = new Set(["computing", "audio", "photography", "gaming", "home-kitchen", "fashion", "outdoors-fitness", "vehicles", "books-hobbies", "other"]);
const MIN_SOURCE_EDGE = 1000;
const OUTPUT_EDGE = 1200;

interface SelectionEntry {
  sourceId: string;
  sourceDomain: string;
  categoryId: string;
  displayName: string;
  keyAttribute: string | null;
  originalTitle: string;
  brand: string | null;
  productType: string | null;
  attributes: Record<string, string>;
  features: string[];
  imageId: string;
  imagePath: string;
  imageWidth: number;
  imageHeight: number;
}

interface Selection {
  source: string;
  sourceUrl: string;
  license: string;
  licenseUrl: string;
  attribution: string;
  retrievedAt: string;
  products: SelectionEntry[];
}

async function fetchOriginal(entry: SelectionEntry): Promise<Buffer> {
  const res = await fetch(ABO_ORIGINAL + entry.imagePath);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return Buffer.from(await res.arrayBuffer());
}

async function main(): Promise<void> {
  const selection = JSON.parse(readFileSync(SELECTION, "utf8")) as Selection;
  mkdirSync(OUT_DIR, { recursive: true });
  const accepted: ManifestProduct[] = [];
  const rejected: { sourceId: string; reason: string }[] = [];
  const seen = new Set<string>();

  for (const e of selection.products) {
    try {
      if (seen.has(e.sourceId)) throw new Error("duplicate source item");
      seen.add(e.sourceId);
      if (!VALID_CATEGORIES.has(e.categoryId)) throw new Error(`unknown category ${e.categoryId}`);
      if (!e.displayName.trim() || !e.originalTitle.trim()) throw new Error("missing name");

      const file = `abo-${e.sourceId.toLowerCase()}.jpg`;
      const outPath = join(OUT_DIR, file);
      if (!existsSync(outPath)) {
        const raw = await fetchOriginal(e);
        const meta = await sharp(raw, { failOn: "error" }).metadata();
        if (meta.width !== e.imageWidth || meta.height !== e.imageHeight) {
          throw new Error(`decoded ${meta.width}x${meta.height}, dataset says ${e.imageWidth}x${e.imageHeight}`);
        }
        if (Math.min(meta.width!, meta.height!) < MIN_SOURCE_EDGE) throw new Error("source image too small");
        await sharp(raw, { failOn: "error" })
          .rotate()
          .resize({ width: OUTPUT_EDGE, height: OUTPUT_EDGE, fit: "inside", withoutEnlargement: true })
          .flatten({ background: "#ffffff" })
          .jpeg({ quality: 84, mozjpeg: true })
          .toFile(outPath);
      }
      const out = await sharp(outPath).metadata();
      accepted.push({
        sourceItemId: e.sourceId,
        sourceDomain: e.sourceDomain,
        categoryId: e.categoryId,
        name: e.displayName.trim(),
        originalTitle: e.originalTitle.trim(),
        brand: e.brand,
        productType: e.productType,
        keyAttribute: e.keyAttribute,
        features: e.features,
        attributes: e.attributes,
        image: {
          sourceImageId: e.imageId,
          sourceImageUrl: ABO_ORIGINAL + e.imagePath,
          file,
          width: out.width!,
          height: out.height!,
          originalWidth: e.imageWidth,
          originalHeight: e.imageHeight,
        },
      });
    } catch (err) {
      rejected.push({ sourceId: e.sourceId, reason: (err as Error).message });
    }
  }

  const manifest: CatalogManifest = {
    source: {
      id: "abo",
      name: selection.source,
      sourceUrl: selection.sourceUrl,
      license: selection.license,
      licenseUrl: selection.licenseUrl,
      attribution: selection.attribution,
      retrievedAt: selection.retrievedAt,
    },
    products: accepted,
  };
  writeFileSync(MANIFEST, JSON.stringify(manifest, null, 2) + "\n");
  console.log(JSON.stringify({ accepted: accepted.length, rejected }, null, 2));

  if (process.argv.includes("--apply")) {
    const { syncCatalog } = await import("../src/catalog.ts");
    console.log(JSON.stringify(syncCatalog(manifest)));
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
