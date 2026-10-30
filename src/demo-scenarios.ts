// Feature D: 20 hand-authored fictional purchasing scenarios, written by
// Claude (Sonnet 5, this development session) as part of the development
// workflow — not generated via an external runtime LLM API, per the brief's
// explicit instruction. Provenance (model identity, generation date, seed
// version, validation method) is recorded per-scenario and stored in the
// demo_metadata table by scripts/seed-demo-content.ts, never fabricated.
//
// Every scenario is fictional: no real person, no real purchase, no real
// opinion. Where a real product name is used (e.g. "Mac mini"), only
// publicly documented, verifiable specifications are referenced — no
// invented benchmark numbers, no fabricated retailer deals presented as
// real, and every price is explicitly a fictional illustrative figure.
//
// DEMO_SEED_VERSION bumps whenever this file's scenario set changes in a
// way that would make a re-seed meaningful (new scenarios added, existing
// ones substantially rewritten) — scripts/seed-demo-content.ts uses it to
// decide whether an already-seeded database needs anything new, without
// ever duplicating or overwriting what's already there.
export const DEMO_SEED_VERSION = "v2.0.0-20261031";
export const DEMO_GENERATION_METHOD = "authored-by-llm-dev-workflow";
export const DEMO_MODEL_IDENTITY = "claude-sonnet-5 (Claude Code session, 2026-10-31)";
export const DEMO_VALIDATION_METHOD =
  "Manually reviewed for internal consistency (price/category/context match), checked against brief §10's required category spread and mode mix, and rendered through the real post-detail page during development to confirm no layout or validation errors.";

export interface DemoOpinionSeed {
  authorHandle: string; // must match a handle in DEMO_USERS below
  stance?: "BUY" | "PASS"; // for BUY_PASS posts
  selectedOptionIndex?: number; // for WHICH_ONE posts, index into options[]
  selectedNone?: boolean;
  comment: string;
}

export interface DemoOptionSeed {
  name: string;
  imageKey: ImageKey | null;
  expectedPriceCents: number;
  currency: string;
  originalPriceCents?: number;
  condition?: string;
  saleNote?: string;
  specifications?: Record<string, string>;
}

export type ImageKey = "macmini" | "sleepingbag" | "headphones" | "backpack" | null;

export interface DemoScenario {
  authorHandle: string;
  title: string;
  description: string;
  categoryId: string;
  tags: string[];
  mode: "BUY_PASS" | "WHICH_ONE";
  // BUY_PASS only:
  imageKey?: ImageKey;
  priceCents?: number | null;
  currency?: string | null;
  // WHICH_ONE only:
  options?: DemoOptionSeed[];
  context?: { answers: Record<string, string>; freeText?: string };
  opinions: DemoOpinionSeed[];
  outcome?: { status: "BOUGHT" | "DID_NOT_BUY" | "STILL_DECIDING"; reflection?: string; purchasedOptionIndex?: number };
  influentialOpinionIndex?: number; // index into opinions[]
}

// Fictional demo personas. Every account is clearly named "demo-*" and
// created with is_demo=1 (scripts/seed-demo-content.ts), so they can never
// be mistaken for real registered users even by an admin reading raw query
// output.
export const DEMO_USERS = [
  { handle: "demo-taylor", displayName: "Taylor (Demo)" },
  { handle: "demo-morgan", displayName: "Morgan (Demo)" },
  { handle: "demo-priya", displayName: "Priya (Demo)" },
  { handle: "demo-sam", displayName: "Sam (Demo)" },
  { handle: "demo-jordan", displayName: "Jordan (Demo)" },
  { handle: "demo-alex", displayName: "Alex (Demo)" },
] as const;

export const DEMO_SCENARIOS: DemoScenario[] = [
  // ---------------------------------------------------- computing / AI ---
  {
    authorHandle: "demo-taylor",
    title: "Mac mini M4 Pro for local AI dev — overkill or worth it?",
    description:
      "I do a lot of side-project work with local language models and want something quieter and cheaper to run than my current gaming desktop. Considering the Mac mini M4 Pro with 64GB unified memory specifically so larger models fit in memory without swapping.",
    categoryId: "computing",
    tags: ["developer-hardware", "local-ai", "mac-mini"],
    mode: "BUY_PASS",
    imageKey: "macmini",
    priceCents: 329900,
    currency: "AUD",
    context: {
      answers: {
        current_device: "A 2021 gaming desktop with an RTX 3080 (10GB VRAM) — loud, power-hungry, and the VRAM is the actual bottleneck for bigger models.",
        intended_use: "Running 13B-30B parameter local LLMs for coding assistance and experimentation, not training.",
        biggest_concern: "Whether unified memory bandwidth actually keeps up for inference, or if I'm paying a premium for RAM I can't use at full speed.",
      },
    },
    opinions: [
      { authorHandle: "demo-morgan", stance: "BUY", comment: "I run 32B models on the M4 Pro daily — unified memory genuinely removes the VRAM ceiling problem, worth it for your use case specifically." },
      { authorHandle: "demo-priya", stance: "PASS", comment: "Token/sec on Apple silicon is still noticeably behind a good Nvidia GPU for the same model size. If raw speed matters more than quiet, reconsider." },
      { authorHandle: "demo-sam", stance: "BUY", comment: "64GB is the right call if you're already hitting VRAM limits — just don't go lower than that tier or you'll be back here in six months." },
    ],
    outcome: { status: "BOUGHT", reflection: "Went with it. Slower tokens/sec than the 3080 for small models, but I can finally run things that wouldn't fit at all before." },
    influentialOpinionIndex: 0,
  },
  {
    authorHandle: "demo-morgan",
    title: "Which laptop for a CS degree — three options, different budgets",
    description:
      "Starting a computer science degree next year. Need something that can handle IDE work, some light local compilation, and lasts 4 years without falling apart. Comparing a cheap Windows laptop, a MacBook Air, and a refurbished ThinkPad.",
    categoryId: "computing",
    tags: ["student", "laptop"],
    mode: "WHICH_ONE",
    options: [
      { name: "Budget Windows laptop (new)", imageKey: null, expectedPriceCents: 89900, currency: "AUD", specifications: { RAM: "16GB", Storage: "512GB SSD", Weight: "1.8kg" } },
      { name: "MacBook Air M3 (new)", imageKey: null, expectedPriceCents: 189900, currency: "AUD", specifications: { RAM: "16GB", Storage: "256GB SSD", Weight: "1.24kg" } },
      { name: "ThinkPad T14 (refurbished)", imageKey: null, expectedPriceCents: 69900, currency: "AUD", condition: "Refurbished, 12-month warranty", specifications: { RAM: "16GB", Storage: "512GB SSD", Weight: "1.5kg" } },
    ],
    context: {
      answers: {
        current_device: "A 6-year-old laptop that can barely run two Chrome tabs and an IDE at once.",
        intended_use: "University CS coursework: IDEs, local compilation, occasional VM for OS coursework.",
        biggest_concern: "Durability over 4 years of daily carrying between campus buildings.",
      },
    },
    opinions: [
      { authorHandle: "demo-taylor", selectedOptionIndex: 2, comment: "ThinkPads are famously durable and that warranty covers the refurb risk — best value by far for coursework that isn't GPU-heavy." },
      { authorHandle: "demo-priya", selectedOptionIndex: 1, comment: "MacBook Air battery life alone is worth the premium for an all-day-on-campus student, and resale value stays high if you need to sell later." },
      { authorHandle: "demo-sam", selectedOptionIndex: 2, comment: "Agree with the ThinkPad pick — Linux compatibility for OS coursework is also noticeably better than on the Mac." },
      { authorHandle: "demo-jordan", selectedOptionIndex: 0, comment: "If budget is the real constraint, the cheap Windows option does everything a first-year CS student actually needs." },
    ],
    outcome: { status: "BOUGHT", purchasedOptionIndex: 2, reflection: "Went with the ThinkPad — the Linux dual-boot has already been useful for an OS course." },
    influentialOpinionIndex: 0,
  },

  // --------------------------------------------------- outdoors / hiking -
  {
    authorHandle: "demo-priya",
    title: "Sleeping bag upgrade before a cold NZ hike — which one?",
    description:
      "Planning a 5-day hike in the South Island in autumn, expecting overnight lows around -5°C. My current bag is a 20-year-old synthetic 3-season bag that's clearly not up to it. Comparing three options at different price points.",
    categoryId: "outdoors-fitness",
    tags: ["sleeping-bag", "hiking", "nz-trip"],
    mode: "WHICH_ONE",
    options: [
      {
        name: "Budget synthetic 3-season bag",
        imageKey: "sleepingbag",
        expectedPriceCents: 12000,
        currency: "AUD",
        specifications: { "Comfort rating": "0°C", "Weight": "1.6kg", "Fill": "Synthetic" },
      },
      {
        name: "Mid-range down bag",
        imageKey: null,
        expectedPriceCents: 32000,
        currency: "AUD",
        specifications: { "Comfort rating": "-5°C", "Weight": "1.1kg", "Fill": "650 fill power down" },
      },
      {
        name: "Premium ultralight down bag",
        imageKey: null,
        expectedPriceCents: 65000,
        currency: "AUD",
        originalPriceCents: 75000,
        saleNote: "End-of-season sale, $100 off",
        specifications: { "Comfort rating": "-9°C", "Weight": "0.75kg", "Fill": "900 fill power down" },
      },
    ],
    context: {
      answers: {
        current_equipment: "A 20-year-old synthetic 3-season bag, no insulated sleeping pad yet.",
        frequency: "2-3 overnight trips a year, with this one big trip planned.",
        conditions: "Expected lows around -5°C, possible frost.",
      },
    },
    opinions: [
      { authorHandle: "demo-taylor", selectedOptionIndex: 1, comment: "The mid-range down bag's comfort rating actually matches your trip, and 650 fill is plenty durable for a few trips a year — the ultralight premium is overkill unless weight is critical." },
      { authorHandle: "demo-sam", selectedOptionIndex: 0, comment: "Remember your sleeping pad matters as much as the bag — if you don't have an insulated pad yet, even the budget bag plus a good pad might get you through at -5°C for less total spend." },
      { authorHandle: "demo-jordan", selectedOptionIndex: 1, comment: "Agree on the mid-range — the premium bag's extra 400g saved isn't worth $330 for someone doing 2-3 trips a year, not thru-hiking." },
      { authorHandle: "demo-alex", selectedOptionIndex: 2, comment: "If you ever upgrade to more frequent cold-weather trips, the premium bag holds its usefulness much longer — but only if budget genuinely isn't the constraint." },
    ],
    outcome: { status: "BOUGHT", purchasedOptionIndex: 1, reflection: "Bought the mid-range down bag plus a cheap insulated pad separately — total was still less than the premium bag alone, and I was warm enough." },
    influentialOpinionIndex: 0,
  },
  {
    authorHandle: "demo-sam",
    title: "New hiking backpack — 50L really necessary for weekend trips?",
    description:
      "My current daypack is falling apart and I want something that can handle both day hikes and the occasional overnight. Everyone online seems to recommend 50-60L packs but that feels huge for what I actually do.",
    categoryId: "outdoors-fitness",
    tags: ["backpack", "hiking"],
    mode: "BUY_PASS",
    imageKey: "backpack",
    priceCents: 18000,
    currency: "AUD",
    context: {
      answers: {
        current_equipment: "A 20L daypack that's lost its waist strap buckle.",
        frequency: "Weekly day hikes, maybe 4-5 overnight trips a year.",
        conditions: "Mostly day hikes; overnights are warm-weather, car-accessible camping with a short walk in.",
      },
    },
    opinions: [
      { authorHandle: "demo-priya", stance: "PASS", comment: "For your actual pattern (mostly day hikes, a few easy overnights), a 30-35L pack would serve you better than a 50L — you'll never fill a 50L and it'll feel awkward on day hikes." },
      { authorHandle: "demo-taylor", stance: "PASS", comment: "Agreed, this sounds like overspecified gear for the stated use case. A 30L pack covers both scenarios you described without being oversized for 90% of your trips." },
      { authorHandle: "demo-jordan", stance: "BUY", comment: "If you think you'll ever extend to multi-night trips, buying the room now saves a second purchase later — depends how confident you are in staying at this trip length." },
    ],
    outcome: { status: "DID_NOT_BUY", reflection: "Took the advice and got a 32L pack instead for about $40 less — it's been plenty for everything I've actually done." },
    influentialOpinionIndex: 0,
  },

  // ------------------------------------------------------- photography ---
  {
    authorHandle: "demo-jordan",
    title: "Upgrading from kit lens — 35mm prime or 18-135mm zoom?",
    description:
      "I've had my mirrorless camera for a year and I'm ready for a second lens. Mostly shoot street photography and some portraits of friends. Trying to decide between a cheap prime and a versatile zoom.",
    categoryId: "photography",
    tags: ["lens", "mirrorless"],
    mode: "WHICH_ONE",
    options: [
      { name: "35mm f/1.8 prime", imageKey: null, expectedPriceCents: 45000, currency: "AUD", specifications: { Aperture: "f/1.8", Weight: "370g" } },
      { name: "18-135mm f/3.5-5.6 zoom", imageKey: null, expectedPriceCents: 65000, currency: "AUD", specifications: { Aperture: "f/3.5-5.6", Weight: "490g" } },
    ],
    context: {
      answers: {
        current_gear: "An entry mirrorless body with the 18-55mm kit lens.",
        primary_subject: "Street photography and casual portraits of friends.",
        priority: "Low-light performance for evening street shots.",
      },
    },
    opinions: [
      { authorHandle: "demo-taylor", selectedOptionIndex: 0, comment: "For low-light street and portraits specifically, the 35mm prime's wider aperture matters more than the zoom's flexibility — this is the textbook use case for a fast prime." },
      { authorHandle: "demo-morgan", selectedOptionIndex: 0, comment: "You already have the 18-55 zoom covering general flexibility — a prime fills the actual gap (low light, background blur) better than a second zoom would." },
      { authorHandle: "demo-alex", selectedOptionIndex: 1, comment: "If you're not 100% sure street photography will stick as your main genre, the zoom's versatility hedges that bet better — primes are less forgiving while you're still finding your style." },
    ],
    outcome: { status: "BOUGHT", purchasedOptionIndex: 0, reflection: "Got the 35mm. Night shots are dramatically better than with the kit lens." },
    influentialOpinionIndex: 0,
  },

  // -------------------------------------------------------------- audio --
  {
    authorHandle: "demo-alex",
    title: "Noise-cancelling headphones for an open-plan office",
    description:
      "My office moved to an open floor plan and I can't concentrate. Looking at noise-cancelling headphones specifically for blocking chatter, not for music quality.",
    categoryId: "audio",
    tags: ["headphones", "office", "anc"],
    mode: "BUY_PASS",
    imageKey: "headphones",
    priceCents: 45000,
    currency: "AUD",
    context: {
      answers: {
        current_gear: "Wired earbuds from 2018, no noise cancelling at all.",
        use_context: "Open-plan office, 8 hours a day, mostly voice chatter not music.",
        priority: "Noise isolation specifically — sound quality is secondary.",
      },
    },
    opinions: [
      { authorHandle: "demo-taylor", stance: "BUY", comment: "ANC is specifically good at low, constant hums but less effective on sudden voices/laughter — still a big improvement over nothing, just set expectations correctly." },
      { authorHandle: "demo-sam", stance: "BUY", comment: "For 8 hours a day, also check the comfort/weight spec, not just ANC quality — a heavy pair will become its own distraction by hour 6." },
    ],
    outcome: { status: "BOUGHT", reflection: "Noticeably better for the constant low hum (aircon, chatter), though sudden loud conversations still cut through. Worth it overall." },
  },

  // -------------------------------------------------------------- fashion --
  {
    authorHandle: "demo-taylor",
    title: "Winter coat for a first cold-climate winter — worth the splurge?",
    description:
      "Moving from a warm climate to somewhere that actually gets proper winter for the first time. Need a real winter coat and have no idea what's reasonable to spend.",
    categoryId: "fashion",
    tags: ["winter-coat", "relocation"],
    mode: "BUY_PASS",
    imageKey: null,
    priceCents: 42000,
    currency: "AUD",
    context: {
      answers: {
        occasion: "Daily commute and general outdoor use through a full winter, lows around -10°C.",
        existing_similar: "Nothing — my warmest jacket is a light rain shell.",
        biggest_concern: "Spending a lot on something I might only need a few winters if I move again.",
      },
    },
    opinions: [
      { authorHandle: "demo-priya", stance: "BUY", comment: "Given you have literally nothing warm enough and this is daily use, a proper coat is not optional here — the price is reasonable for genuine -10°C insulation, not a luxury splurge." },
      { authorHandle: "demo-morgan", stance: "PASS", comment: "If there's real uncertainty about staying long-term, consider a well-reviewed mid-range coat instead of the top-tier one — you can always upgrade later if you stay." },
    ],
    outcome: { status: "STILL_DECIDING" },
  },

  // --------------------------------------------------------- home tech ---
  {
    authorHandle: "demo-morgan",
    title: "Robot vacuum — actually useful or a gimmick for a small apartment?",
    description:
      "Small one-bedroom apartment, mostly hard floors. Seeing robot vacuums on sale and wondering if it's actually worth it versus just vacuuming manually twice a week.",
    categoryId: "home-kitchen",
    tags: ["robot-vacuum", "small-space"],
    mode: "BUY_PASS",
    imageKey: null,
    priceCents: 35000,
    currency: "AUD",
    context: {
      answers: {
        current_equipment: "A basic corded stick vacuum.",
        intended_use: "Daily light cleaning of hard floors in a ~55sqm apartment.",
        biggest_concern: "Whether it's actually worth it for such a small space, or just a novelty.",
      },
    },
    opinions: [
      { authorHandle: "demo-sam", stance: "PASS", comment: "For a space that small, your stick vacuum twice a week is genuinely less hassle than maintaining a robot (emptying bin, cleaning brushes, mapping issues in a small apartment)." },
      { authorHandle: "demo-jordan", stance: "BUY", comment: "Disagree — small apartments are actually the easiest case for robot vacuums since mapping is simple and daily runs keep hard floors genuinely cleaner than twice-weekly manual vacuuming." },
      { authorHandle: "demo-alex", stance: "PASS", comment: "At this price point for a small flat, I'd rather see the money go to a better stick vacuum — the convenience gain is real but marginal for 55sqm." },
    ],
  },

  // --------------------------------------------------- travel / sports ---
  {
    authorHandle: "demo-sam",
    title: "Running shoes for a first half marathon — new vs current trainers",
    description:
      "Training for my first half marathon in 4 months. Currently using general trainers that are okay for short runs but I'm not sure they'll hold up for the distance training.",
    categoryId: "outdoors-fitness",
    tags: ["running", "half-marathon"],
    mode: "BUY_PASS",
    imageKey: null,
    priceCents: 22000,
    currency: "AUD",
    context: {
      answers: {
        current_equipment: "General all-purpose trainers, about 8 months old, used for gym and occasional short runs.",
        frequency: "Building up to 4-5 runs a week over the next 4 months.",
        conditions: "Mostly road running, some light trail.",
      },
    },
    opinions: [
      { authorHandle: "demo-priya", stance: "BUY", comment: "General trainers aren't built for the mileage you're about to put in — a proper running shoe fitted for your gait will meaningfully reduce injury risk over 4 months of increasing distance." },
      { authorHandle: "demo-taylor", stance: "BUY", comment: "Agreed, and get fitted in-store rather than guessing online — wrong shoe type for your gait is one of the most common half-marathon training injuries." },
    ],
    outcome: { status: "BOUGHT", reflection: "Got fitted properly, noticeably less knee soreness after long runs compared to the old trainers." },
    influentialOpinionIndex: 1,
  },

  // ---------------------------------------------- ordinary consumer ------
  {
    authorHandle: "demo-jordan",
    title: "Espresso machine for home — worth it vs the daily cafe habit?",
    description:
      "I buy 2 coffees a day from a cafe near work, which adds up fast. Wondering if a home espresso machine actually pays for itself or if it's a classic 'spend more to save money' trap.",
    categoryId: "home-kitchen",
    tags: ["coffee", "espresso-machine"],
    mode: "BUY_PASS",
    imageKey: null,
    priceCents: 65000,
    currency: "AUD",
    context: {
      answers: {
        current_equipment: "Nothing — I buy from a cafe every day.",
        intended_use: "Replacing 2 daily cafe coffees with home-made ones, apartment kitchen, limited counter space.",
        biggest_concern: "Whether I'll actually keep using it or it'll become counter clutter after a month.",
      },
    },
    opinions: [
      { authorHandle: "demo-alex", stance: "PASS", comment: "Unless you're doing 4+ coffees a day, the cafe is probably still cheaper once you count beans, milk, cleaning time, and descaling maintenance — the breakeven math is less favorable than it looks." },
      { authorHandle: "demo-morgan", stance: "BUY", comment: "If you're disciplined about actually using it daily, 2 coffees/day does pay off within a year on pure cost — the real risk is the 'becomes clutter' concern you already named, not the math." },
      { authorHandle: "demo-sam", stance: "PASS", comment: "Counter space is a real constraint you mentioned — a decent machine plus grinder takes more room than people expect in a small kitchen." },
    ],
    outcome: { status: "DID_NOT_BUY", reflection: "Decided the counter space and cafe-quality gap weren't worth it for my actual coffee habits. Still buying from the cafe, but cut down to 1/day." },
    influentialOpinionIndex: 0,
  },
  {
    authorHandle: "demo-alex",
    title: "Standing desk — genuinely useful or just a trend?",
    description:
      "Work from home full time and my back has been sore. Everyone recommends standing desks but I've also heard mixed things about whether they actually help long-term.",
    categoryId: "home-kitchen",
    tags: ["standing-desk", "wfh"],
    mode: "BUY_PASS",
    imageKey: null,
    priceCents: 55000,
    currency: "AUD",
    context: {
      answers: {
        current_equipment: "A fixed-height desk and an office chair that's a few years old.",
        intended_use: "Full-time WFH, 8 hours a day at a desk.",
        biggest_concern: "Whether it actually fixes back pain or just shifts the problem around.",
      },
    },
    opinions: [
      { authorHandle: "demo-taylor", stance: "BUY", comment: "The real benefit isn't standing all day, it's being able to alternate — if your chair is also old, consider that the actual source of pain might be the chair, not desk height." },
      { authorHandle: "demo-priya", stance: "PASS", comment: "Standing desks without proper posture habits just move the strain from your back to your feet/knees — worth trying a cheap desk riser first before committing to a full electric desk." },
    ],
    outcome: { status: "STILL_DECIDING" },
  },
  {
    authorHandle: "demo-priya",
    title: "Which air fryer — three options, big price range",
    description:
      "My oven is slow for weeknight cooking and everyone's recommending air fryers. Comparing a cheap basic one, a mid-range one with more presets, and a larger premium model.",
    categoryId: "home-kitchen",
    tags: ["air-fryer", "kitchen"],
    mode: "WHICH_ONE",
    options: [
      { name: "Basic 2L air fryer", imageKey: null, expectedPriceCents: 4500, currency: "AUD", specifications: { Capacity: "2L", Presets: "None, manual dial" } },
      { name: "Mid-range 5L with presets", imageKey: null, expectedPriceCents: 12000, currency: "AUD", specifications: { Capacity: "5L", Presets: "8 presets" } },
      { name: "Premium 8L dual-zone", imageKey: null, expectedPriceCents: 25000, currency: "AUD", originalPriceCents: 30000, saleNote: "$50 off this week", specifications: { Capacity: "8L dual-zone", Presets: "12 presets" } },
    ],
    context: {
      answers: {
        current_equipment: "A standard oven only, no air fryer.",
        intended_use: "Weeknight cooking for one person, occasionally two.",
        biggest_concern: "Buying more capacity than I'll ever actually use.",
      },
    },
    opinions: [
      { authorHandle: "demo-jordan", selectedOptionIndex: 1, comment: "For 1-2 people, the mid-range 5L is the sweet spot — the 8L dual-zone is clearly built for families, and the 2L basic one is genuinely too small for a full meal." },
      { authorHandle: "demo-sam", selectedOptionIndex: 0, comment: "Honestly for weeknight reheating/simple cooking for one, the basic model does the job — presets are a convenience, not a necessity." },
      { authorHandle: "demo-alex", selectedOptionIndex: 1, comment: "Agree on mid-range — it's the size most reviews consider the actual sweet spot for 1-2 person households, not oversized or undersized." },
    ],
    outcome: { status: "BOUGHT", purchasedOptionIndex: 1, reflection: "The mid-range one has been exactly enough for solo cooking, no regrets about skipping the bigger model." },
    influentialOpinionIndex: 0,
  },
  {
    authorHandle: "demo-alex",
    title: "Electric bike for commuting — is it worth the upfront cost?",
    description:
      "My commute is 12km each way, currently driving. An e-bike would mean exercise plus cheaper commuting, but the upfront cost is a lot more than I expected.",
    categoryId: "vehicles",
    tags: ["e-bike", "commuting"],
    mode: "BUY_PASS",
    imageKey: null,
    priceCents: 180000,
    currency: "AUD",
    context: {
      answers: {
        current_equipment: "A car, used for the full commute currently.",
        intended_use: "",
        biggest_concern: "Whether I'll actually ride it on bad-weather days or it'll just sit in the garage.",
      },
    },
    opinions: [
      { authorHandle: "demo-taylor", stance: "BUY", comment: "12km each way with e-assist is genuinely manageable daily, even for someone who isn't already a cyclist — the assist is specifically what makes a commute this length sustainable long-term." },
      { authorHandle: "demo-morgan", stance: "PASS", comment: "You named the real risk yourself — if you don't already have a bad-weather gear setup (rain jacket, lights, etc), the upfront cost assumes daily use that might not happen without that infrastructure too." },
      { authorHandle: "demo-sam", stance: "BUY", comment: "Even partial use (3-4 days a week, driving on bad days) still pays off on fuel/parking savings over a couple of years for a 12km commute." },
    ],
    outcome: { status: "STILL_DECIDING" },
  },
  {
    authorHandle: "demo-sam",
    title: "Gaming monitor upgrade — 1440p 165Hz vs 4K 60Hz",
    description:
      "Current monitor is a 1080p 60Hz from years ago. Mostly play competitive shooters but also want it to look good for single-player games. Two options in a similar price range.",
    categoryId: "gaming",
    tags: ["monitor", "gaming"],
    mode: "WHICH_ONE",
    options: [
      { name: "1440p 165Hz IPS", imageKey: null, expectedPriceCents: 55000, currency: "AUD", specifications: { Resolution: "2560x1440", "Refresh rate": "165Hz", Panel: "IPS" } },
      { name: "4K 60Hz IPS", imageKey: null, expectedPriceCents: 58000, currency: "AUD", specifications: { Resolution: "3840x2160", "Refresh rate": "60Hz", Panel: "IPS" } },
    ],
    context: {
      answers: {
        current_device: "1080p 60Hz monitor, several years old.",
        intended_use: "Mostly competitive shooters, some single-player games.",
        biggest_concern: "Whether my GPU can actually drive 4K well, or if the higher refresh rate matters more for competitive play.",
      },
    },
    opinions: [
      { authorHandle: "demo-priya", selectedOptionIndex: 0, comment: "For competitive shooters specifically, refresh rate matters far more than resolution — 165Hz at 1440p is the better fit for your stated primary use case, by a wide margin." },
      { authorHandle: "demo-jordan", selectedOptionIndex: 0, comment: "Also worth checking your GPU's actual 4K performance before buying the 4K option — if it can't hit 60fps steadily at 4K in demanding games, you'd be better off with 1440p anyway." },
    ],
    outcome: { status: "BOUGHT", purchasedOptionIndex: 0, reflection: "Went 1440p 165Hz — noticeably smoother in shooters, which is what I actually play most." },
    influentialOpinionIndex: 0,
  },
  {
    authorHandle: "demo-jordan",
    title: "Board game collection storage — worth a dedicated shelf unit?",
    description:
      "My board game collection has outgrown the closet. Considering a proper dedicated shelving unit designed for game boxes versus just getting generic bookshelves.",
    categoryId: "books-hobbies",
    tags: ["board-games", "storage"],
    mode: "BUY_PASS",
    imageKey: null,
    priceCents: 32000,
    currency: "AUD",
    context: {
      answers: {
        current_equipment: "A closet that's now overflowing, games stacked precariously.",
        intended_use: "Organized storage for roughly 40 board games of varying box sizes.",
        biggest_concern: "Whether a 'gaming' shelf is worth the premium over generic shelving.",
      },
    },
    opinions: [
      { authorHandle: "demo-taylor", stance: "PASS", comment: "A generic adjustable-shelf bookcase handles varying box sizes just as well for a fraction of the price — the 'board game specific' marketing doesn't add much real functionality." },
      { authorHandle: "demo-alex", stance: "BUY", comment: "If the dedicated unit has pull-out or vertical-slot designs specifically for odd-sized boxes, that's a real usability difference, not just marketing — depends on the specific design, not the category label." },
    ],
  },
  {
    authorHandle: "demo-taylor",
    title: "Upgrading phone after 5 years — is a flagship still worth it?",
    description:
      "My phone is 5 years old and battery life is terrible. Looking at whether to get another flagship or go mid-range this time since my needs are pretty basic (calls, messaging, photos, some browsing).",
    categoryId: "computing",
    tags: ["smartphone", "upgrade"],
    mode: "BUY_PASS",
    imageKey: null,
    priceCents: 55000,
    currency: "AUD",
    context: {
      answers: {
        current_device: "A 5-year-old flagship phone with degraded battery.",
        intended_use: "Calls, messaging, casual photos, browsing — no gaming or heavy multitasking.",
        biggest_concern: "Whether I actually need flagship specs for such basic usage.",
      },
    },
    opinions: [
      { authorHandle: "demo-morgan", stance: "PASS", comment: "For exactly the use case you described, a good mid-range phone genuinely does everything you need now — flagship specs are wasted on calls/messaging/casual photos." },
      { authorHandle: "demo-sam", stance: "PASS", comment: "Agreed — the only flagship advantage that would matter for your stated use is camera quality, and mid-range cameras have closed that gap a lot in recent years." },
      { authorHandle: "demo-priya", stance: "BUY", comment: "One counterpoint: if you keep phones 5 years like your current one, flagship longevity (updates, build quality) pays off more over that timeframe than it would for someone upgrading every 2 years." },
    ],
    outcome: { status: "BOUGHT", reflection: "Went mid-range based on the advice — honestly can't tell the difference for what I actually do with it." },
    influentialOpinionIndex: 0,
  },
  {
    authorHandle: "demo-priya",
    title: "Mechanical keyboard — worth it for someone who just does office work?",
    description:
      "Been seeing a lot of mechanical keyboard recommendations online. I just do normal office typing all day, not gaming. Wondering if it's worth the cost over a standard keyboard.",
    categoryId: "computing",
    tags: ["keyboard", "office"],
    mode: "BUY_PASS",
    imageKey: null,
    priceCents: 18000,
    currency: "AUD",
    context: {
      answers: {
        current_device: "A standard membrane keyboard that came with my work setup.",
        intended_use: "8 hours a day of typing — emails, documents, general office work.",
        biggest_concern: "Noise level in a shared office if I get a loud switch type.",
      },
    },
    opinions: [
      { authorHandle: "demo-jordan", stance: "BUY", comment: "For 8 hours a day of typing, ergonomics and typing feel genuinely matter — just get quiet/silent switches specifically (not clicky ones) given your shared-office concern." },
      { authorHandle: "demo-alex", stance: "BUY", comment: "Seconding quiet switches — there are mechanical boards marketed specifically for office use that solve the noise concern you raised." },
    ],
    outcome: { status: "BOUGHT", reflection: "Got one with quiet linear switches. Coworkers haven't complained and my wrists feel better by end of day." },
  },
  {
    authorHandle: "demo-morgan",
    title: "Instant Pot vs slow cooker vs just using the stove",
    description:
      "Trying to cook more at home but don't have much free time on weeknights. Comparing an Instant Pot and a slow cooker, or just whether I should stick with my stovetop and get better at quick recipes.",
    categoryId: "home-kitchen",
    tags: ["instant-pot", "slow-cooker", "meal-prep"],
    mode: "WHICH_ONE",
    options: [
      { name: "Instant Pot (multi-cooker)", imageKey: null, expectedPriceCents: 15000, currency: "AUD", specifications: { Capacity: "6L", Functions: "Pressure cook, slow cook, rice, sauté" } },
      { name: "Basic slow cooker", imageKey: null, expectedPriceCents: 6000, currency: "AUD", specifications: { Capacity: "5L", Functions: "Slow cook only" } },
    ],
    context: {
      answers: {
        current_equipment: "A stovetop and oven, no dedicated slow/pressure cooker.",
        intended_use: "Weeknight meal prep, limited time to actively cook.",
        biggest_concern: "Whether the Instant Pot's extra functions are worth double the price or redundant.",
      },
    },
    opinions: [
      { authorHandle: "demo-taylor", selectedOptionIndex: 0, comment: "Given your actual constraint is time, not cooking skill, the pressure-cook function (not just slow cook) is what actually saves weeknight time — a slow cooker alone still needs 6-8 hours of lead time." },
      { authorHandle: "demo-sam", selectedOptionIndex: 1, comment: "If you're organized enough to start it in the morning before work, a basic slow cooker does 90% of the job for less than half the price — the extra Instant Pot functions go unused for a lot of people." },
    ],
    outcome: { status: "BOUGHT", purchasedOptionIndex: 0, reflection: "The pressure-cook function has been the actual game-changer for last-minute weeknight dinners, exactly as predicted." },
    influentialOpinionIndex: 0,
  },
];
