import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { CASES, getCase } from "./cases/checkout.ts";
import type { CaseDef } from "./cases/types.ts";
import {
  ensureRoom,
  getExperiments,
  getParticipant,
  recordExperiment,
  resetCase,
  upsertParticipant,
  type ExperimentRow,
} from "./db.ts";
import { renderMarkdown } from "./markdown.ts";
import { caseNotFoundPage, landingPage, roomPage, type RoomStateBootstrap } from "./pages.ts";
import { broadcast, presenceCount, sseHeaders, subscribe } from "./sse.ts";
import { recommend, type EvidenceItem } from "./recommend.ts";
import { pageShell } from "./ui.ts";

const PORT = Number(process.env.PORT ?? 8080);
const SESSION_COOKIE = "brp_sid";
const SESSION_MAX_AGE_SECONDS = 180 * 24 * 60 * 60;

function parseCookies(header: string | undefined): Record<string, string> {
  const out: Record<string, string> = {};
  if (!header) return out;
  for (const part of header.split(";")) {
    const i = part.indexOf("=");
    if (i === -1) continue;
    const key = part.slice(0, i).trim();
    const value = part.slice(i + 1).trim();
    if (key) out[key] = decodeURIComponent(value);
  }
  return out;
}

// Every request gets a stable participant id, set the first time it's missing.
// Looking around a case needs no display name (getParticipant returns null
// until one is chosen); only submitting an experiment requires one, enforced
// in the /experiments handler below.
function sessionId(req: IncomingMessage, res: ServerResponse): string {
  const cookies = parseCookies(req.headers.cookie);
  const existing = cookies[SESSION_COOKIE];
  if (existing) return existing;
  const id = randomUUID();
  res.setHeader(
    "Set-Cookie",
    `${SESSION_COOKIE}=${id}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${SESSION_MAX_AGE_SECONDS}`,
  );
  return id;
}

async function readBody(req: IncomingMessage): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) chunks.push(chunk as Buffer);
  return Buffer.concat(chunks).toString("utf8");
}

function json(res: ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, { "Content-Type": "application/json" });
  res.end(JSON.stringify(body));
}

function toEvidence(caseDef: CaseDef, experiments: ExperimentRow[]): EvidenceItem<Record<string, string>>[] {
  return experiments.map((e) => ({ params: e.params, passed: e.passed }));
}

function buildState(caseDef: CaseDef, sid: string): RoomStateBootstrap {
  const experiments = getExperiments(caseDef.id);
  const rec = recommend(caseDef, toEvidence(caseDef, experiments));
  return {
    experiments: experiments.map((e) => ({
      id: e.id,
      participantId: e.participantId,
      participantName: e.participantName,
      params: e.params,
      expectedResult: e.expectedResult,
      actualResult: e.actualResult,
      passed: e.passed,
      note: e.note,
      createdAt: e.createdAt,
    })),
    recommendation: {
      status: rec.status,
      consistentHypothesisIds: rec.consistentHypothesisIds,
      testedCount: rec.tested.size,
      totalCombos: caseDef.allCombos.length,
      next: rec.next,
      explanation: rec.explanation,
    },
    presence: presenceCount(caseDef.id),
  };
}

function readmePage(): string {
  const md = readFileSync("README.md", "utf8");
  const body = `<div class="readme-body">${renderMarkdown(md)}<p><a href="/">&larr; Back to Bug Relay</a></p></div>`;
  return pageShell({ title: "About — Bug Relay", body });
}

function validateParams(caseDef: CaseDef, params: unknown): Record<string, string> | null {
  if (typeof params !== "object" || params === null) return null;
  const input = params as Record<string, unknown>;
  const out: Record<string, string> = {};
  for (const v of caseDef.variables) {
    const value = input[v.key];
    if (typeof value !== "string" || !v.options.some((o) => o.value === value)) return null;
    out[v.key] = value;
  }
  return out;
}

const server = createServer((req, res) => {
  void (async () => {
    try {
      const url = new URL(req.url ?? "/", "http://localhost");
      const sid = sessionId(req, res);

      if (req.method === "GET" && url.pathname === "/") {
        res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
        res.end(landingPage());
        return;
      }

      if (req.method === "GET" && url.pathname === "/readme/") {
        res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
        res.end(readmePage());
        return;
      }

      const roomMatch = url.pathname.match(/^\/cases\/([^/]+)$/);
      if (req.method === "GET" && roomMatch) {
        const caseDef = getCase(roomMatch[1]);
        if (!caseDef) {
          res.writeHead(404, { "Content-Type": "text/html; charset=utf-8" });
          res.end(caseNotFoundPage(roomMatch[1]));
          return;
        }
        ensureRoom(caseDef.id);
        const participant = getParticipant(sid);
        res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
        res.end(
          roomPage({
            participant: { id: sid, displayName: participant?.displayName ?? null },
            caseDef: {
              id: caseDef.id,
              title: caseDef.title,
              tagline: caseDef.tagline,
              reproductionGoal: caseDef.reproductionGoal,
              variables: caseDef.variables,
              hypotheses: caseDef.hypotheses.map((h) => ({ id: h.id, label: h.label })),
            },
            state: buildState(caseDef, sid),
          }),
        );
        return;
      }

      if (req.method === "GET" && url.pathname === "/api/me") {
        const participant = getParticipant(sid);
        json(res, 200, { id: sid, displayName: participant?.displayName ?? null });
        return;
      }

      if (req.method === "POST" && url.pathname === "/api/me") {
        const body = await readBody(req);
        let displayName: unknown;
        try {
          displayName = (JSON.parse(body) as { displayName?: unknown }).displayName;
        } catch {
          json(res, 400, { error: "invalid JSON body" });
          return;
        }
        if (typeof displayName !== "string" || displayName.trim().length === 0 || displayName.length > 40) {
          json(res, 400, { error: "displayName must be a non-empty string of at most 40 characters" });
          return;
        }
        const participant = upsertParticipant(sid, displayName.trim());
        json(res, 200, { id: participant.id, displayName: participant.displayName });
        return;
      }

      const apiCaseMatch = url.pathname.match(/^\/api\/cases\/([^/]+)\/(state|experiments|events|reveal|reset)$/);
      if (apiCaseMatch) {
        const caseDef = getCase(apiCaseMatch[1]);
        const action = apiCaseMatch[2];
        if (!caseDef) {
          json(res, 404, { error: `no such case: ${apiCaseMatch[1]}` });
          return;
        }
        ensureRoom(caseDef.id);

        if (req.method === "GET" && action === "state") {
          json(res, 200, buildState(caseDef, sid));
          return;
        }

        if (req.method === "GET" && action === "events") {
          res.writeHead(200, sseHeaders());
          res.write(`event: state\ndata: ${JSON.stringify(buildState(caseDef, sid))}\n\n`);
          const unsubscribe = subscribe(caseDef.id, res);
          broadcast(caseDef.id, "presence", { count: presenceCount(caseDef.id) });
          req.on("close", () => {
            unsubscribe();
            broadcast(caseDef.id, "presence", { count: presenceCount(caseDef.id) });
          });
          return;
        }

        if (req.method === "GET" && action === "reveal") {
          const rec = recommend(caseDef, toEvidence(caseDef, getExperiments(caseDef.id)));
          if (rec.status !== "identified" || rec.consistentHypothesisIds.length !== 1) {
            json(res, 409, { error: "not enough evidence yet to reveal the known cause" });
            return;
          }
          json(res, 200, { explanation: caseDef.groundTruthExplanation });
          return;
        }

        if (req.method === "POST" && action === "experiments") {
          const participant = getParticipant(sid);
          if (!participant) {
            json(res, 400, { error: "set a display name with POST /api/me before submitting an experiment" });
            return;
          }
          const body = await readBody(req);
          let parsed: { params?: unknown; note?: unknown };
          try {
            parsed = JSON.parse(body) as { params?: unknown; note?: unknown };
          } catch {
            json(res, 400, { error: "invalid JSON body" });
            return;
          }
          const params = validateParams(caseDef, parsed.params);
          if (!params) {
            json(res, 400, { error: "params must set a valid option for every case variable" });
            return;
          }
          const note = typeof parsed.note === "string" && parsed.note.trim().length > 0 ? parsed.note.trim().slice(0, 500) : null;

          const { expected, actual, passed } = caseDef.evaluate(params);
          const experiment = recordExperiment({
            caseId: caseDef.id,
            participantId: sid,
            params,
            expectedResult: expected,
            actualResult: actual,
            passed,
            note,
          });
          const state = buildState(caseDef, sid);
          broadcast(caseDef.id, "state", state);
          json(res, 200, {
            experiment: {
              id: experiment.id,
              passed: experiment.passed,
              expectedResult: experiment.expectedResult,
              actualResult: experiment.actualResult,
            },
            state,
          });
          return;
        }

        if (req.method === "POST" && action === "reset") {
          resetCase(caseDef.id);
          const state = buildState(caseDef, sid);
          broadcast(caseDef.id, "state", state);
          json(res, 200, { state });
          return;
        }
      }

      res.writeHead(404, { "Content-Type": "text/plain" });
      res.end("not found");
    } catch (err) {
      console.error(err);
      res.writeHead(500, { "Content-Type": "text/plain" });
      res.end("internal error");
    }
  })();
});

// Belt-and-braces: fail loudly in logs if the built-in case registry is ever
// empty, since every route above assumes getCase() can succeed for at least
// one id.
if (Object.keys(CASES).length === 0) {
  console.error("no cases registered in src/cases/checkout.ts — the app has nothing to serve");
}

server.listen(PORT, "0.0.0.0", () => {
  console.log(`bug relay listening on :${PORT}`);
});
