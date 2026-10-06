import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { DatabaseSync } from "node:sqlite";

// fly.toml mounts the one persistent volume at /data; everything else in the
// container is thrown away on restart or redeploy. Overridable so local runs
// and CI (which uses a throwaway tmpfs /data) don't need special-casing.
const DB_PATH = process.env.DB_PATH ?? "/data/sticks.db";
mkdirSync(dirname(DB_PATH), { recursive: true });

const db = new DatabaseSync(DB_PATH);
db.exec(`
  CREATE TABLE IF NOT EXISTS removed_sticks (
    stick_id TEXT PRIMARY KEY,
    removed_at TEXT NOT NULL
  )
`);

const selectRemoved = db.prepare("SELECT stick_id FROM removed_sticks");
const insertRemoved = db.prepare(
  "INSERT OR IGNORE INTO removed_sticks (stick_id, removed_at) VALUES (?, ?)",
);

export function getRemovedIds(): Set<string> {
  const rows = selectRemoved.all() as { stick_id: string }[];
  return new Set(rows.map((r) => r.stick_id));
}

// INSERT OR IGNORE on a primary key: removing the same stick twice writes
// nothing the second time, so a duplicate request can never corrupt the count.
export function markRemoved(stickId: string): void {
  insertRemoved.run(stickId, new Date().toISOString());
}
