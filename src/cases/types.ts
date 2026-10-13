// Shared shape for a built-in investigation case. Only checkout.ts implements
// one today; responsive-layout and async-state cases (Crit 9 P1) would add
// their own file against this same shape rather than widening it speculatively.

export interface VariableOption {
  value: string;
  label: string;
}

export interface Variable {
  key: string;
  label: string;
  options: VariableOption[];
}

// A predefined candidate explanation for the fault. `predicts` says whether
// this hypothesis expects a given parameter combination to be (wrongly)
// rejected. Hypotheses are shown to participants as soon as a case is
// opened — what's hidden until reveal is which one is actually true
// (CaseDef.causeHypothesisId / groundTruthExplanation), not the list itself.
export interface Hypothesis<P> {
  id: string;
  label: string;
  predicts: (params: P) => boolean;
}

export type Outcome = "accepted" | "rejected";

export interface EvaluationResult {
  expected: Outcome;
  actual: Outcome;
  passed: boolean;
}

export interface CaseDef<P extends Record<string, string> = Record<string, string>> {
  id: string;
  title: string;
  tagline: string;
  reproductionGoal: string;
  variables: Variable[];
  // Canonical, deterministic enumeration of every valid parameter
  // combination, in declared-variable order. Both recommend.ts and the
  // offline simulation iterate this directly, so it's the one source of
  // truth for "every combination that can be tested."
  allCombos: P[];
  comboKey: (params: P) => string;
  evaluate: (params: P) => EvaluationResult;
  hypotheses: Hypothesis<P>[];
  causeHypothesisId: string;
  groundTruthExplanation: string;
}

export interface CaseSummary {
  id: string;
  title: string;
  tagline: string;
}
