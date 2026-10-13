#!/usr/bin/env node
// A small deterministic offline simulation comparing three next-test
// strategies on the one built-in case (checkout-failure): how many
// experiments does each need, run against the fixture's real ground truth,
// before the consistent-hypothesis set first collapses to exactly the true
// cause? Run manually with `node scripts/simulate-recommendations.ts`;
// PROCESS.md cites its real output. No benchmark numbers here are invented —
// this script is the only source of the numbers it prints.
//
// Caveat printed below is load-bearing: 8 combinations is too small a space
// to support a statistical claim like "X% faster." This measures one
// concrete run against one concrete fixture, nothing more general.
import { checkoutFailureCase, type CheckoutParams } from "../src/cases/checkout.ts";
import { recommend } from "../src/recommend.ts";
import type { EvidenceItem } from "../src/recommend.ts";

const CASE = checkoutFailureCase;
const TRUE_HYPOTHESIS_ID = CASE.causeHypothesisId;

function runExperiment(params: CheckoutParams): EvidenceItem<CheckoutParams> {
  return { params, passed: CASE.evaluate(params).passed };
}

function identified(consistentIds: string[]): boolean {
  return consistentIds.length === 1 && consistentIds[0] === TRUE_HYPOTHESIS_ID;
}

// Strategy under test: always run the recommend() algorithm's top pick.
function stepsForInfoGain(): number {
  const evidence: EvidenceItem<CheckoutParams>[] = [];
  for (let step = 1; step <= CASE.allCombos.length; step++) {
    const rec = recommend(CASE, evidence);
    if (identified(rec.consistentHypothesisIds)) return step - 1;
    const next = rec.next?.params ?? CASE.allCombos.find((p) => !rec.tested.has(CASE.comboKey(p)));
    if (!next) break;
    evidence.push(runExperiment(next));
  }
  const final = recommend(CASE, evidence);
  return identified(final.consistentHypothesisIds) ? evidence.length : evidence.length;
}

// Baseline 1: run the case's canonical combination order, skipping nothing,
// stopping as soon as the hypothesis set collapses.
function stepsForFixedOrder(): number {
  const evidence: EvidenceItem<CheckoutParams>[] = [];
  for (const params of CASE.allCombos) {
    const rec = recommend(CASE, evidence);
    if (identified(rec.consistentHypothesisIds)) return evidence.length;
    evidence.push(runExperiment(params));
  }
  return evidence.length;
}

// mulberry32 — same small deterministic PRNG this repo already used for
// Pick-Up Sticks' layout (src/sticks.ts, removed in the Crit 9 pivot).
// Reseeded per trial so "random" is reproducible run to run.
function mulberry32(seed: number): () => number {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Baseline 2: pick uniformly at random among untested combinations.
function stepsForRandom(seed: number): number {
  const rand = mulberry32(seed);
  const evidence: EvidenceItem<CheckoutParams>[] = [];
  const untested = [...CASE.allCombos];
  while (untested.length > 0) {
    const rec = recommend(CASE, evidence);
    if (identified(rec.consistentHypothesisIds)) return evidence.length;
    const i = Math.floor(rand() * untested.length);
    const params = untested.splice(i, 1)[0];
    evidence.push(runExperiment(params));
  }
  return evidence.length;
}

const RANDOM_TRIALS = 200;
const randomResults: number[] = [];
for (let seed = 1; seed <= RANDOM_TRIALS; seed++) randomResults.push(stepsForRandom(seed * 2654435761));
const randomMean = randomResults.reduce((a, b) => a + b, 0) / randomResults.length;
const randomMin = Math.min(...randomResults);
const randomMax = Math.max(...randomResults);

console.log("Bug Relay — next-test strategy simulation (checkout-failure case)");
console.log(`Candidate hypotheses: ${CASE.hypotheses.length}, total combinations: ${CASE.allCombos.length}`);
console.log(`True cause: "${CASE.hypotheses.find((h) => h.id === TRUE_HYPOTHESIS_ID)?.label}"`);
console.log("");
console.log(`Info-gain recommendation strategy: ${stepsForInfoGain()} experiments`);
console.log(`Fixed canonical-order strategy:     ${stepsForFixedOrder()} experiments`);
console.log(
  `Random-untested-combo strategy:    mean ${randomMean.toFixed(2)} ` +
    `(min ${randomMin}, max ${randomMax}) over ${RANDOM_TRIALS} seeded trials`,
);
console.log("");
console.log(
  "Caveat: this fixture has only 8 combinations and 5 predefined hypotheses — far too " +
    "small a space to support a general statistical claim about the strategy. This is one " +
    "concrete, reproducible comparison on one concrete fixture, not evidence the approach " +
    "generalises.",
);
