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
// The create/edit post form always renders every category's context-prompt
// block (up to 3 fields each, across ~10 categories) plus up to 4 comparison
// option blocks (8 fields each) in the DOM — client-side JS shows only the
// relevant ones, but the browser submits every field in the form regardless
// of visibility. The pre-v2 limit of 30 silently dropped fields past that
// count (including `mode` itself), which only surfaced as a wrong-mode
// post getting created — found via an actual end-to-end browser submission,
// not by inspection. 200 leaves comfortable headroom over the ~90-field
// worst case (10 categories x 3 + free_text + 4 options x 8 + core fields)
// without opening the door to a genuinely abusive field count.
const MAX_FIELDS = 200;

export function parseMultipart(req: IncomingMessage): Promise<ParsedMultipart> {
  return new Promise((resolve, reject) => {
    let busboy: Busboy.Busboy;
    try {
      busboy = Busboy({
        headers: req.headers,
        limits: {
          fileSize: MAX_UPLOAD_BYTES,
          files: MAX_FILES,
          fields: MAX_FIELDS,
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
