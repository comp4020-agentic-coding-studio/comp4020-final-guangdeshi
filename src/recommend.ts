import type { CaseDef, Hypothesis } from "./cases/types.ts";

// Pure, DB-free: given a case definition and the evidence persisted so far,
// say which predefined hypotheses are still consistent with it and what the
// single most useful next test is. No I/O, no randomness — the same evidence
// always produces the same recommendation, which is what lets spec/recommend.test.ts
// check it directly against hand-computed numbers instead of through the server.

export interface EvidenceItem<P> {
  params: P;
  // Whether that experiment's actual result matched the case's expected
  // result (i.e. "did checkout work"), not an arbitrary human PASS/FAIL —
  // see cases/checkout.ts' evaluate().
  passed: boolean;
}

export type RecommendationStatus = "insufficient" | "narrowing" | "identified";

export interface Candidate<P> {
  params: P;
  comboKey: string;
  expectedInfoGainBits: number;
}

export interface Recommendation<P> {
  status: RecommendationStatus;
  consistentHypothesisIds: string[];
  tested: Set<string>;
  next: Candidate<P> | null;
  explanation: string;
}

// A hypothesis is consistent with the evidence so far iff it correctly
// predicted every observed experiment's pass/fail outcome.
export function consistentHypotheses<P>(
  hypotheses: Hypothesis<P>[],
  evidence: EvidenceItem<P>[],
): Hypothesis<P>[] {
  return hypotheses.filter((h) => evidence.every((e) => h.predicts(e.params) === !e.passed));
}

function entropyOfUniform(n: number): number {
  return n <= 1 ? 0 : Math.log2(n);
}

// Expected information gain (bits) of testing `candidate`, under a uniform
// prior over the hypotheses still consistent with the evidence so far. This
// is the standard pre-test expected-entropy-reduction formula: the outcome of
// the candidate test is unknown, so we weight each possible posterior
// (hypotheses that would survive if the test passes, and if it fails) by how
// many of the currently-consistent hypotheses predict each outcome.
function expectedInfoGain<P>(consistent: Hypothesis<P>[], candidate: P): number {
  const n = consistent.length;
  if (n <= 1) return 0;
  let predictFault = 0;
  for (const h of consistent) if (h.predicts(candidate)) predictFault++;
  const predictOk = n - predictFault;
  let posterior = 0;
  if (predictFault > 0) posterior += (predictFault / n) * entropyOfUniform(predictFault);
  if (predictOk > 0) posterior += (predictOk / n) * entropyOfUniform(predictOk);
  return entropyOfUniform(n) - posterior;
}

// How many of a case's declared variables differ between two parameter sets.
// Used only as a tie-breaker (prefer a one-variable change from the most
// recent experiment), never as the primary ranking signal.
function variableDiffCount<P extends Record<string, string>>(caseDef: CaseDef<P>, a: P, b: P): number {
  let diff = 0;
  for (const v of caseDef.variables) if (a[v.key] !== b[v.key]) diff++;
  return diff;
}

function describeCombo<P extends Record<string, string>>(caseDef: CaseDef<P>, params: P): string {
  return caseDef.variables.map((v) => `${v.label.toLowerCase()}=${params[v.key as keyof P]}`).join(", ");
}

export function recommend<P extends Record<string, string>>(
  caseDef: CaseDef<P>,
  evidence: EvidenceItem<P>[],
): Recommendation<P> {
  const consistent = consistentHypotheses(caseDef.hypotheses, evidence);
  const tested = new Set(evidence.map((e) => caseDef.comboKey(e.params)));

  // "identified" / "no hypothesis fits" only apply once the evidence has
  // actually narrowed the candidate set — with zero experiments every
  // hypothesis is trivially still consistent, so that case falls through to
  // the untested-combo ranking below instead, with status "insufficient"
  // naming that there's no evidence yet rather than that a cause is known.
  if (consistent.length <= 1 && evidence.length > 0) {
    const explanation =
      consistent.length === 1
        ? `Only one hypothesis remains consistent with the evidence: "${consistent[0].label}". Further tests in this model can't narrow it further — review the evidence board, then reveal the known cause when ready.`
        : "No predefined hypothesis matches the evidence collected so far. The real cause may not be on the candidate list — review the evidence board rather than trusting a recommendation.";
    return {
      status: "identified",
      consistentHypothesisIds: consistent.map((h) => h.id),
      tested,
      next: null,
      explanation,
    };
  }

  const status: RecommendationStatus = evidence.length === 0 ? "insufficient" : "narrowing";
  const untested = caseDef.allCombos.filter((p) => !tested.has(caseDef.comboKey(p)));
  if (untested.length === 0) {
    return {
      status,
      consistentHypothesisIds: consistent.map((h) => h.id),
      tested,
      next: null,
      explanation: `Every combination has been tested at least once, but ${consistent.length} hypotheses remain consistent with the evidence. They can't be told apart by this case's variables alone.`,
    };
  }

  const last = evidence.length > 0 ? evidence[evidence.length - 1].params : null;
  const scored = untested.map((params) => ({
    params,
    comboKey: caseDef.comboKey(params),
    expectedInfoGainBits: expectedInfoGain(consistent, params),
    diffFromLast: last ? variableDiffCount(caseDef, last, params) : 0,
    canonicalIndex: caseDef.allCombos.indexOf(params),
  }));

  scored.sort((a, b) => {
    if (b.expectedInfoGainBits !== a.expectedInfoGainBits) return b.expectedInfoGainBits - a.expectedInfoGainBits;
    const aDist = last ? Math.abs(a.diffFromLast - 1) : 0;
    const bDist = last ? Math.abs(b.diffFromLast - 1) : 0;
    if (aDist !== bDist) return aDist - bDist;
    return a.canonicalIndex - b.canonicalIndex;
  });

  const best = scored[0];
  const explanation =
    evidence.length === 0
      ? `No experiments yet. Starting with ${describeCombo(caseDef, best.params)} is expected to rule out the most of the ${consistent.length} candidate hypotheses (≈${best.expectedInfoGainBits.toFixed(2)} bits of expected information gain).`
      : best.expectedInfoGainBits > 0
        ? `${consistent.length} hypotheses are still consistent. Testing ${describeCombo(caseDef, best.params)} is expected to rule out the most of them (≈${best.expectedInfoGainBits.toFixed(2)} bits of expected information gain).`
        : `${consistent.length} hypotheses are still consistent, but no untested combination is expected to discriminate between them further; testing ${describeCombo(caseDef, best.params)} still adds new coverage.`;

  return {
    status,
    consistentHypothesisIds: consistent.map((h) => h.id),
    tested,
    next: { params: best.params, comboKey: best.comboKey, expectedInfoGainBits: best.expectedInfoGainBits },
    explanation,
  };
}
