import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { DatabaseSync } from "node:sqlite";

// fly.toml mounts the one persistent volume at /data; everything else in the
// container is thrown away on restart or redeploy. Overridable so local runs
// and CI (which uses a throwaway tmpfs /data) don't need special-casing.
const DB_PATH = process.env.DB_PATH ?? "/data/bug-relay.db";
mkdirSync(dirname(DB_PATH), { recursive: true });

const db = new DatabaseSync(DB_PATH);

// Pivot cleanup: this repo's Crit 8 product (Pick-Up Sticks) persisted a
// single `removed_sticks` table that nothing in Bug Relay reads or writes.
// Dropped once on startup rather than left as dead schema.
db.exec(`DROP TABLE IF EXISTS removed_sticks`);

db.exec(`
  CREATE TABLE IF NOT EXISTS participants (
    id TEXT PRIMARY KEY,
    display_name TEXT NOT NULL,
    joined_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS rooms (
    case_id TEXT PRIMARY KEY,
    created_at TEXT NOT NULL
  );

  -- Append-only by convention: every write is an INSERT (see insertExperiment
  -- below), never an UPDATE/DELETE of an existing row. Two simultaneous
  -- submissions — even byte-identical ones — each get their own row and their
  -- own id; see docs/adr/0001-concurrent-investigation-evidence.md.
  CREATE TABLE IF NOT EXISTS experiments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    case_id TEXT NOT NULL,
    participant_id TEXT NOT NULL,
    params TEXT NOT NULL,
    expected_result TEXT NOT NULL,
    actual_result TEXT NOT NULL,
    passed INTEGER NOT NULL,
    note TEXT,
    created_at TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS experiments_case_id ON experiments (case_id);
`);

export interface Participant {
  id: string;
  displayName: string;
  joinedAt: string;
}

export interface ExperimentRow {
  id: number;
  caseId: string;
  participantId: string;
  participantName: string;
  params: Record<string, string>;
  expectedResult: string;
  actualResult: string;
  passed: boolean;
  note: string | null;
  createdAt: string;
}

const selectParticipant = db.prepare("SELECT id, display_name, joined_at FROM participants WHERE id = ?");
const insertParticipant = db.prepare(
  "INSERT INTO participants (id, display_name, joined_at) VALUES (?, ?, ?)",
);
const updateParticipantName = db.prepare("UPDATE participants SET display_name = ? WHERE id = ?");

export function getParticipant(id: string): Participant | null {
  const row = selectParticipant.get(id) as { id: string; display_name: string; joined_at: string } | undefined;
  return row ? { id: row.id, displayName: row.display_name, joinedAt: row.joined_at } : null;
}

export function upsertParticipant(id: string, displayName: string): Participant {
  const existing = getParticipant(id);
  if (existing) {
    updateParticipantName.run(displayName, id);
    return { ...existing, displayName };
  }
  const joinedAt = new Date().toISOString();
  insertParticipant.run(id, displayName, joinedAt);
  return { id, displayName, joinedAt };
}

const insertRoom = db.prepare("INSERT OR IGNORE INTO rooms (case_id, created_at) VALUES (?, ?)");

// Rooms are 1:1 with a built-in case for this version (documented in
// README.md as a deliberate P0 simplification): visiting a case's URL
// creates its room on first access and every subsequent visitor joins the
// same one. Idempotent — INSERT OR IGNORE on the case_id primary key.
export function ensureRoom(caseId: string): void {
  insertRoom.run(caseId, new Date().toISOString());
}

const insertExperiment = db.prepare(`
  INSERT INTO experiments (case_id, participant_id, params, expected_result, actual_result, passed, note, created_at)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?)
`);

export function recordExperiment(input: {
  caseId: string;
  participantId: string;
  params: Record<string, string>;
  expectedResult: string;
  actualResult: string;
  passed: boolean;
  note: string | null;
}): ExperimentRow {
  const createdAt = new Date().toISOString();
  const result = insertExperiment.run(
    input.caseId,
    input.participantId,
    JSON.stringify(input.params),
    input.expectedResult,
    input.actualResult,
    input.passed ? 1 : 0,
    input.note,
    createdAt,
  );
  const participant = getParticipant(input.participantId);
  return {
    id: Number(result.lastInsertRowid),
    caseId: input.caseId,
    participantId: input.participantId,
    participantName: participant?.displayName ?? "Unknown",
    params: input.params,
    expectedResult: input.expectedResult,
    actualResult: input.actualResult,
    passed: input.passed,
    note: input.note,
    createdAt,
  };
}

const selectExperimentsForCase = db.prepare(`
  SELECT e.id, e.case_id, e.participant_id, p.display_name AS participant_name, e.params,
         e.expected_result, e.actual_result, e.passed, e.note, e.created_at
  FROM experiments e
  LEFT JOIN participants p ON p.id = e.participant_id
  WHERE e.case_id = ?
  ORDER BY e.id ASC
`);

interface ExperimentSqlRow {
  id: number;
  case_id: string;
  participant_id: string;
  participant_name: string | null;
  params: string;
  expected_result: string;
  actual_result: string;
  passed: number;
  note: string | null;
  created_at: string;
}

export function getExperiments(caseId: string): ExperimentRow[] {
  const rows = selectExperimentsForCase.all(caseId) as unknown as ExperimentSqlRow[];
  return rows.map((r) => ({
    id: r.id,
    caseId: r.case_id,
    participantId: r.participant_id,
    participantName: r.participant_name ?? "Unknown",
    params: JSON.parse(r.params) as Record<string, string>,
    expectedResult: r.expected_result,
    actualResult: r.actual_result,
    passed: r.passed === 1,
    note: r.note,
    createdAt: r.created_at,
  }));
}

const deleteExperimentsForCase = db.prepare("DELETE FROM experiments WHERE case_id = ?");

// Reset is a real product feature each case ships with (the brief requires
// it), not accidental data loss: it clears only that case's experiments and
// is always a deliberate, explicit participant action, broadcast to every
// open session the same way a new experiment is (see src/sse.ts).
export function resetCase(caseId: string): void {
  deleteExperimentsForCase.run(caseId);
}
