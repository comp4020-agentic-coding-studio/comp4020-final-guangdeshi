// Upload validation and storage. Security posture, per CLAUDE.md:
//  - the declared Content-Type from the client is never trusted alone; the
//    real file signature is checked by actually decoding the image with
//    sharp (a corrupt or disguised file simply fails to decode);
//  - files are re-encoded to JPEG on the way in, which both normalizes the
//    format and strips EXIF/metadata (sharp does not copy metadata unless
//    .withMetadata() is called, so this is the safe default, not an opt-in);
//  - stored filenames are opaque UUIDs chosen server-side — the client's
//    original filename is never used as a path component, which rules out
//    path traversal by construction.
import { randomUUID } from "node:crypto";
import { mkdirSync, writeFileSync, readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import sharp from "sharp";
import { createImageRow, type ImageRow } from "./db.ts";

// Same convention as src/db.ts's DB_PATH: defaults to a local relative path
// (/data isn't writable without root locally); fly.toml and CI both set
// UPLOAD_DIR explicitly to the real volume mount.
const UPLOAD_DIR = process.env.UPLOAD_DIR ?? "./data/uploads";
mkdirSync(UPLOAD_DIR, { recursive: true });

// This app runs on a single 256MB Fly machine (fly.toml) — sharp's default
// concurrency (one decode thread per CPU core) is tuned for a dedicated
// image-processing box, not a shared 256MB budget also running Node/V8 and
// node:sqlite. Capped at 1 so concurrent uploads queue rather than each
// spike memory simultaneously; a real production incident (an oversized
// scrypt parameter, not this) already OOM-crashed this exact machine once
// during Crit 10 deployment verification, so this is deliberate headroom,
// not a guess. See docs/architecture/AUTH_AND_PERMISSIONS.md for that
// incident's account.
sharp.concurrency(1);

export const MAX_UPLOAD_BYTES = 10 * 1024 * 1024; // 10MB raw upload cap
const MAX_DIMENSION = 4096;
const MIN_DIMENSION = 64;
const OUTPUT_MAX_DIMENSION = 1600;

export class ImageValidationError extends Error {}

export async function processAndStoreImage(ownerUserId: string, buffer: Buffer): Promise<ImageRow> {
  if (buffer.length === 0) throw new ImageValidationError("empty file");
  if (buffer.length > MAX_UPLOAD_BYTES) throw new ImageValidationError("file too large");

  let image;
  let metadata;
  try {
    image = sharp(buffer, { failOn: "error" });
    metadata = await image.metadata();
  } catch {
    throw new ImageValidationError("not a valid image file");
  }

  const { width, height, format } = metadata;
  if (!width || !height) throw new ImageValidationError("could not determine image dimensions");
  if (width < MIN_DIMENSION || height < MIN_DIMENSION) throw new ImageValidationError("image too small");
  if (width > MAX_DIMENSION || height > MAX_DIMENSION) throw new ImageValidationError("image too large");
  if (!format || !["jpeg", "png", "webp", "gif", "avif"].includes(format)) {
    throw new ImageValidationError("unsupported image format");
  }

  // Re-encode (strips metadata, normalizes format, bounds output size).
  const outputBuffer = await sharp(buffer, { failOn: "error" })
    .rotate() // apply EXIF orientation before metadata is dropped
    .resize({ width: OUTPUT_MAX_DIMENSION, height: OUTPUT_MAX_DIMENSION, fit: "inside", withoutEnlargement: true })
    .jpeg({ quality: 85 })
    .toBuffer();
  const finalMeta = await sharp(outputBuffer).metadata();

  const id = randomUUID();
  const filename = `${id}.jpg`;
  writeFileSync(join(UPLOAD_DIR, filename), outputBuffer);

  return createImageRow(ownerUserId, filename, "image/jpeg", finalMeta.width!, finalMeta.height!, outputBuffer.length);
}

export function readImageFile(filename: string): Buffer | undefined {
  // filename always comes from our own DB (opaque UUID + ".jpg"), never from
  // request input, so there's no path to traverse — but double-check the
  // shape anyway as defense in depth before touching the filesystem.
  if (!/^[a-f0-9-]{36}\.jpg$/.test(filename)) return undefined;
  const path = join(UPLOAD_DIR, filename);
  if (!existsSync(path)) return undefined;
  return readFileSync(path);
}
