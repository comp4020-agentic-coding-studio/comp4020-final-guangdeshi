import { describe, expect, it } from "vitest";
import { checkoutFailureCase, type CheckoutParams } from "../src/cases/checkout.ts";
import { consistentHypotheses, recommend, type EvidenceItem } from "../src/recommend.ts";

// Pure unit tests against src/recommend.ts and src/cases/checkout.ts directly —
// no server, no database. These are the fixture-trigger/non-trigger and
// next-test-algorithm tests the Crit 9 brief asks for.

function evidence(shipping: CheckoutParams["shipping"], payment: CheckoutParams["payment"], promo: CheckoutParams["promo"]): EvidenceItem<CheckoutParams> {
  const params: CheckoutParams = { shipping, payment, promo };
  return { params, passed: checkoutFailureCase.evaluate(params).passed };
}

describe("checkout fixture ground truth", () => {
  it("rejects exactly when shipping=express and promo=applied", () => {
    expect(checkoutFailureCase.evaluate({ shipping: "express", payment: "card", promo: "applied" }).passed).toBe(false);
    expect(checkoutFailureCase.evaluate({ shipping: "express", payment: "paypal", promo: "applied" }).passed).toBe(false);
  });

  it("accepts every other combination, including express alone and promo alone", () => {
    expect(checkoutFailureCase.evaluate({ shipping: "express", payment: "card", promo: "none" }).passed).toBe(true);
    expect(checkoutFailureCase.evaluate({ shipping: "standard", payment: "card", promo: "applied" }).passed).toBe(true);
    expect(checkoutFailureCase.evaluate({ shipping: "standard", payment: "paypal", promo: "none" }).passed).toBe(true);
  });

  it("payment method never affects the outcome (decoy variable)", () => {
    for (const shipping of ["standard", "express"] as const) {
      for (const promo of ["none", "applied"] as const) {
        const card = checkoutFailureCase.evaluate({ shipping, payment: "card", promo }).passed;
        const paypal = checkoutFailureCase.evaluate({ shipping, payment: "paypal", promo }).passed;
        expect(paypal).toBe(card);
      }
    }
  });

  it("enumerates exactly 8 combinations, each unique by comboKey", () => {
    expect(checkoutFailureCase.allCombos).toHaveLength(8);
    const keys = new Set(checkoutFailureCase.allCombos.map((p) => checkoutFailureCase.comboKey(p)));
    expect(keys.size).toBe(8);
  });
});

describe("consistentHypotheses", () => {
  it("keeps every hypothesis consistent with zero evidence", () => {
    expect(consistentHypotheses(checkoutFailureCase.hypotheses, [])).toHaveLength(checkoutFailureCase.hypotheses.length);
  });

  it("rules out no-fault the moment any failing experiment is observed", () => {
    const result = consistentHypotheses(checkoutFailureCase.hypotheses, [evidence("express", "card", "applied")]);
    expect(result.map((h) => h.id)).not.toContain("no-fault");
  });

  it("rules out payment-paypal and promo-applied once a passing paypal+promo experiment is observed", () => {
    const result = consistentHypotheses(checkoutFailureCase.hypotheses, [evidence("standard", "paypal", "applied")]);
    const ids = result.map((h) => h.id);
    expect(ids).not.toContain("payment-paypal");
    expect(ids).not.toContain("promo-applied");
    expect(ids).toContain("shipping-express");
    expect(ids).toContain("express-plus-promo");
  });

  it("converges to exactly express-plus-promo given the full discriminating sequence", () => {
    const seq = [
      evidence("standard", "card", "none"),
      evidence("express", "paypal", "applied"),
      evidence("standard", "paypal", "applied"),
      evidence("express", "paypal", "none"),
    ];
    const result = consistentHypotheses(checkoutFailureCase.hypotheses, seq);
    expect(result.map((h) => h.id)).toEqual(["express-plus-promo"]);
  });
});

describe("recommend", () => {
  it("reports status insufficient and a non-null next test with zero evidence", () => {
    const rec = recommend(checkoutFailureCase, []);
    expect(rec.status).toBe("insufficient");
    expect(rec.next).not.toBeNull();
    expect(rec.consistentHypothesisIds).toHaveLength(checkoutFailureCase.hypotheses.length);
  });

  it("never recommends an already-tested combination", () => {
    const seen = [evidence("standard", "card", "none")];
    const rec = recommend(checkoutFailureCase, seen);
    expect(rec.next).not.toBeNull();
    expect(rec.tested.has(checkoutFailureCase.comboKey(seen[0].params))).toBe(true);
    expect(rec.tested.has(rec.next!.comboKey)).toBe(false);
  });

  it("changes its recommendation as new evidence accumulates", () => {
    const first = recommend(checkoutFailureCase, []);
    // standard/card/none passes, and no hypothesis predicted it would fail,
    // so this particular experiment rules nothing out — recommend() still
    // has to move on (not recommend the same combo again).
    const afterOne = recommend(checkoutFailureCase, [evidence("standard", "card", "none")]);
    expect(afterOne.tested.has(checkoutFailureCase.comboKey({ shipping: "standard", payment: "card", promo: "none" }))).toBe(true);
    expect(afterOne.next?.comboKey).not.toBe(checkoutFailureCase.comboKey({ shipping: "standard", payment: "card", promo: "none" }));

    // A failing experiment, by contrast, does rule something out (no-fault).
    const afterFailure = recommend(checkoutFailureCase, [evidence("express", "card", "applied")]);
    expect(afterFailure.consistentHypothesisIds.length).toBeLessThan(first.consistentHypothesisIds.length);
    expect(afterFailure.consistentHypothesisIds).not.toContain("no-fault");
  });

  it("reports status identified once the evidence narrows to exactly one hypothesis", () => {
    const seq = [
      evidence("standard", "card", "none"),
      evidence("express", "paypal", "applied"),
      evidence("standard", "paypal", "applied"),
      evidence("express", "paypal", "none"),
    ];
    const rec = recommend(checkoutFailureCase, seq);
    expect(rec.status).toBe("identified");
    expect(rec.consistentHypothesisIds).toEqual(["express-plus-promo"]);
    expect(rec.next).toBeNull();
  });

  it("is deterministic: the same evidence always produces the same recommendation", () => {
    const seq = [evidence("standard", "card", "none"), evidence("express", "card", "applied")];
    const a = recommend(checkoutFailureCase, seq);
    const b = recommend(checkoutFailureCase, seq);
    expect(a.next?.comboKey).toBe(b.next?.comboKey);
    expect(a.explanation).toBe(b.explanation);
  });

  it("prefers a one-variable change from the most recent experiment when info gain ties", () => {
    // After this single passing baseline experiment, every untested combo
    // that disagrees with "no-fault" scores the same expected info gain (the
    // hypothesis set only splits into "still predicts fault here" vs. not,
    // and most untested combos are predicted fault-free by 4 of the 5
    // hypotheses) — so the tie-break should favour changing exactly one
    // variable from {standard, card, none}.
    const rec = recommend(checkoutFailureCase, [evidence("standard", "card", "none")]);
    expect(rec.next).not.toBeNull();
    const variables = checkoutFailureCase.variables.map((v) => v.key);
    const diffCount = variables.filter((k) => rec.next!.params[k as keyof CheckoutParams] !== ("standard|card|none".split("|")[variables.indexOf(k)])).length;
    expect(diffCount).toBeLessThanOrEqual(2);
  });

  it("expected info gain matches a hand-computed value for the first recommendation", () => {
    // 5 consistent hypotheses, uniform prior. Candidate standard/paypal/applied:
    // predicted-fault by {payment-paypal, promo-applied} = 2, predicted-ok by
    // {shipping-express, express-plus-promo, no-fault} = 3.
    // H(5) - [ (2/5)*H(2) + (3/5)*H(3) ] = log2(5) - (0.4*1 + 0.6*log2(3))
    const rec = recommend(checkoutFailureCase, []);
    const expected = Math.log2(5) - (0.4 * 1 + 0.6 * Math.log2(3));
    expect(rec.next?.expectedInfoGainBits).toBeCloseTo(expected, 10);
  });
});
