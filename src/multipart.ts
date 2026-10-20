// Thin wrapper around busboy for the one shape this app needs: a form with
// text fields plus 0-4 named file parts. Enforces size limits at the parser
// level (not just after the fact) so an oversized or over-numerous upload is
// rejected before it fully buffers into memory.
import type { IncomingMessage } from "node:http";
import Busboy from "busboy";
import { MAX_UPLOAD_BYTES } from "./images.ts";

export interface ParsedFile {
  fieldname: string;
  filename: string;
  mimeType: string;
  buffer: Buffer;
}

export interface ParsedMultipart {
  fields: Record<string, string | string[]>;
  files: ParsedFile[];
}

export class MultipartError extends Error {}

const MAX_FILES = 4;
const MAX_FIELD_SIZE = 10 * 1024; // text fields are short (title, tags, etc.)

export function parseMultipart(req: IncomingMessage): Promise<ParsedMultipart> {
  return new Promise((resolve, reject) => {
    let busboy: Busboy.Busboy;
    try {
      busboy = Busboy({
        headers: req.headers,
        limits: {
          fileSize: MAX_UPLOAD_BYTES,
          files: MAX_FILES,
          fields: 30,
          fieldSize: MAX_FIELD_SIZE,
        },
      });
    } catch {
      reject(new MultipartError("invalid multipart request"));
      return;
    }

    const fields: Record<string, string | string[]> = {};
    const files: ParsedFile[] = [];
    let hadError = false;

    busboy.on("field", (name, value) => {
      // A repeated field name (e.g. several `interests` checkboxes) collects
      // into an array rather than the last value silently winning.
      if (name in fields) {
        const existing = fields[name];
        fields[name] = Array.isArray(existing) ? [...existing, value] : [existing, value];
      } else {
        fields[name] = value;
      }
    });

    busboy.on("file", (fieldname, stream, info) => {
      const chunks: Buffer[] = [];
      let truncated = false;
      stream.on("data", (chunk) => chunks.push(chunk));
      stream.on("limit", () => {
        truncated = true;
      });
      stream.on("end", () => {
        if (truncated) {
          hadError = true;
          reject(new MultipartError("uploaded file exceeds the size limit"));
          return;
        }
        if (chunks.length > 0) {
          files.push({
            fieldname,
            filename: info.filename ?? "upload",
            mimeType: info.mimeType ?? "application/octet-stream",
            buffer: Buffer.concat(chunks),
          });
        }
      });
    });

    busboy.on("filesLimit", () => {
      hadError = true;
      reject(new MultipartError(`too many files (max ${MAX_FILES})`));
    });

    busboy.on("error", (err) => {
      hadError = true;
      reject(err instanceof Error ? err : new MultipartError(String(err)));
    });

    busboy.on("finish", () => {
      if (!hadError) resolve({ fields, files });
    });

    req.pipe(busboy);
  });
}
