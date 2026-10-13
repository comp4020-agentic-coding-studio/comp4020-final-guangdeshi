import type { CaseDef, EvaluationResult, Hypothesis } from "./types.ts";

// The fixture under investigation. This is a deliberately tiny, deterministic
// mock checkout — not a real payment integration — so the "bug" is a rule in
// this function, not an actual vulnerability or a real third-party defect.
export interface CheckoutParams {
  [key: string]: string;
  shipping: "standard" | "express";
  payment: "card" | "paypal";
  promo: "none" | "applied";
}

export const SHIPPING_OPTIONS = ["standard", "express"] as const;
export const PAYMENT_OPTIONS = ["card", "paypal"] as const;
export const PROMO_OPTIONS = ["none", "applied"] as const;

// Ground truth (hidden from participants until they choose to reveal it):
// the express-shipping surcharge is applied *after* the promo discount is
// computed, but the discount is then taken off the post-surcharge total as
// if it still matched the original subtotal, driving the charged total
// negative relative to what validation expects and tripping a "total doesn't
// match" rejection. Only express + promo applied triggers it; payment method
// never matters, it's a decoy variable.
function checkoutAccepts(p: CheckoutParams): boolean {
  return !(p.shipping === "express" && p.promo === "applied");
}

function evaluate(params: CheckoutParams): EvaluationResult {
  const actual: EvaluationResult["actual"] = checkoutAccepts(params) ? "accepted" : "rejected";
  return { expected: "accepted", actual, passed: actual === "accepted" };
}

const ALL_COMBOS: CheckoutParams[] = [];
for (const shipping of SHIPPING_OPTIONS) {
  for (const payment of PAYMENT_OPTIONS) {
    for (const promo of PROMO_OPTIONS) {
      ALL_COMBOS.push({ shipping, payment, promo });
    }
  }
}

function comboKey(p: CheckoutParams): string {
  return `${p.shipping}|${p.payment}|${p.promo}`;
}

// Five predefined candidate explanations, shown to every participant from the
// start so the hypothesis list itself is never a secret — only which one is
// actually true is withheld until reveal. Four single- or combined-condition
// guesses plus the implicit "nothing here actually reproduces" hypothesis,
// which stays consistent until an experiment contradicts it.
const HYPOTHESES: Hypothesis<CheckoutParams>[] = [
  { id: "payment-paypal", label: "PayPal payments are rejected", predicts: (p) => p.payment === "paypal" },
  { id: "promo-applied", label: "Applying a promo code causes rejection", predicts: (p) => p.promo === "applied" },
  { id: "shipping-express", label: "Express shipping alone causes rejection", predicts: (p) => p.shipping === "express" },
  {
    id: "express-plus-promo",
    label: "Express shipping combined with a promo code causes rejection",
    predicts: (p) => p.shipping === "express" && p.promo === "applied",
  },
  { id: "no-fault", label: "Checkout works correctly in every tested combination", predicts: () => false },
];

export const checkoutFailureCase: CaseDef<CheckoutParams> = {
  id: "checkout-failure",
  title: "Checkout Failure",
  tagline: "A valid order is sometimes rejected. Find the combination that breaks it.",
  reproductionGoal:
    "Determine exactly which combination of shipping method, payment method, and promo code causes an otherwise valid checkout to be rejected.",
  variables: [
    {
      key: "shipping",
      label: "Shipping",
      options: [
        { value: "standard", label: "Standard" },
        { value: "express", label: "Express" },
      ],
    },
    {
      key: "payment",
      label: "Payment",
      options: [
        { value: "card", label: "Card" },
        { value: "paypal", label: "PayPal" },
      ],
    },
    {
      key: "promo",
      label: "Promo code",
      options: [
        { value: "none", label: "None" },
        { value: "applied", label: "Applied" },
      ],
    },
  ],
  allCombos: ALL_COMBOS,
  comboKey,
  evaluate,
  hypotheses: HYPOTHESES,
  causeHypothesisId: "express-plus-promo",
  groundTruthExplanation:
    "The express-shipping surcharge is calculated after the promo discount, but the discount is then re-subtracted from the post-surcharge total as if the subtotal hadn't changed. The charged total no longer matches what validation expects, so the order is rejected. This only happens when express shipping and an applied promo code are combined; the payment method never affects it.",
};

export const CASES: Record<string, CaseDef<any>> = {
  [checkoutFailureCase.id]: checkoutFailureCase,
};

export function getCase(id: string): CaseDef<any> | undefined {
  return CASES[id];
}
