// Structured, server-side activity logging for C10 "Fly by instruments".
// Every meaningful server action writes one line to stdout (so `fly logs`
// and local dev both see it, per the course's "five places logs live")
// AND one row to the activity_events table (so the admin observability page
// and SSE live log view can serve history without re-parsing stdout, and so
// logs survive whatever stdout retention the platform applies).
//
// What is deliberately NEVER logged, per CLAUDE.md: passwords, raw session
// cookie values, CSRF tokens, full email addresses, uploaded image bytes, or
// opinion/post free-text content. Identifiers (user id, post id, request id)
// are logged; content is not.
import { insertActivityEvent, type ActivityEvent } from "./db.ts";
import { broadcastLog } from "./sse.ts";

export type ActivityAction =
  | "auth.registered"
  | "auth.register_failed"
  | "auth.logged_in"
  | "auth.login_failed"
  | "auth.logged_out"
  | "auth.password_changed"
  | "post.created"
  | "post.updated"
  | "post.opened"
  | "post.deleted"
  | "opinion.created"
  | "opinion.updated"
  | "opinion.deleted"
  | "outcome.recorded"
  | "report.created"
  | "report.resolved"
  | "authorization.denied";

export interface LogFields {
  requestId: string;
  userId?: string | null;
  action: ActivityAction;
  targetType?: string | null;
  targetId?: string | null;
  status: "success" | "failure";
  latencyMs?: number | null;
  meta?: Record<string, unknown>;
}

const SENSITIVE_META_KEYS = new Set(["password", "comment", "description", "reflection", "token", "cookie", "email"]);

function scrubMeta(meta: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(meta)) {
    out[key] = SENSITIVE_META_KEYS.has(key) ? "[redacted]" : value;
  }
  return out;
}

export function logEvent(fields: LogFields): void {
  const ts = new Date().toISOString();
  const meta = scrubMeta(fields.meta ?? {});
  const record: Omit<ActivityEvent, "id"> = {
    ts,
    requestId: fields.requestId,
    userId: fields.userId ?? null,
    action: fields.action,
    targetType: fields.targetType ?? null,
    targetId: fields.targetId ?? null,
    status: fields.status,
    latencyMs: fields.latencyMs ?? null,
    meta,
  };

  // stdout: one JSON object per line, picked up by `fly logs` / dev terminal.
  console.log(JSON.stringify({ level: fields.status === "failure" ? "warn" : "info", ...record }));

  insertActivityEvent(record);
  broadcastLog(record);
}

export function pseudonymForUser(userId: string | null): string {
  if (!userId) return "anon";
  return userId.slice(0, 8);
}
