// Real-world purchasing references: a small, hand-curated, independently
// verified set of genuine external discussions and buying guides, shown on
// Discover's "Real-world examples" tab. Modeled on src/context-prompts.ts's
// own pattern ("a fixed, small, author-curated set... not something a user
// ever creates or edits" — see that file's header comment) rather than a
// database table: these are never created, edited, voted on, commented on,
// or searched the way a post is. They are not posts, have no author, no
// opinions, no outcome, and are structurally invisible to listFeed/
// listMostDiscussed/activityStats/searchPosts because they never touch the
// `posts` table at all — never excluded by a WHERE clause, simply never
// present.
//
// Every entry's sourceUrl was fetched and read directly during research (not
// guessed, not inferred from a search snippet) — see
// docs/research/EXTERNAL_REFERENCES_PROVENANCE.md for the full verification
// record, including the exact fetch date and what each source does and does
// not say. `summary` is an original editorial description written from that
// verified content, never a verbatim copy of the source presented as if it
// were the original text, and `knownGaps` says explicitly what the source
// does not tell you — never invented to fill a gap.
//
// REFERENCES_VERSION bumps whenever an entry's content changes in a way
// that would make a cache/re-check meaningful (a correction, a new entry, a
// removed dead link) — there is no re-seed mechanism to drive (nothing here
// touches the database), but it gives the provenance doc and this file a
// shared point of reference.
export const REFERENCES_VERSION = "v1.0.0-20261031";

export type ReferenceImageKey = "sennheiser-hd555" | "rancilio-silvia" | "airfryer-5458" | "roomba-i7plus" | "keychron-k8" | null;

export interface ExternalReference {
  id: string;
  title: string;
  categoryId: string;
  sourceUrl: string;
  sourcePlatform: string;
  sourceDate: string; // the original discussion/article's own date, not the fetch date
  summary: string; // original editorial summary, written from the verified source content
  knownGaps: string; // what the source does NOT tell you — never invented to fill in
  imageKey: ReferenceImageKey;
  imageIsRepresentative: boolean; // true = a generic category photo, not the exact item discussed
}

export const EXTERNAL_REFERENCES: ExternalReference[] = [
  {
    id: "ref-budget-mechanical-keyboard",
    title: "Budget mechanical keyboard for office work, not gaming",
    categoryId: "computing",
    sourceUrl: "https://forums.anandtech.com/threads/non-gaming-keyboard-recommendation.2270390",
    sourcePlatform: "AnandTech Forums",
    sourceDate: "2012-09-13",
    summary:
      "A forum poster (PaducahPhil) needed a replacement mechanical keyboard for office use after their old one broke, with a strict $50 budget — well under the ~$100 starting price for most mechanical boards. The community's top suggestion was Unicomp (which holds the original IBM buckling-spring patent), with a cheaper fallback: a used IBM Model M, found secondhand for around $30.",
    knownGaps:
      "The thread never says which specific keyboard the poster ultimately bought, or how it held up — only the recommendations given, not a confirmed outcome.",
    imageKey: "keychron-k8",
    imageIsRepresentative: true,
  },
  {
    id: "ref-budget-espresso-machine",
    title: "Budget espresso machine for an 8-person office",
    categoryId: "home-kitchen",
    sourceUrl: "https://forums.anandtech.com/threads/recommend-me-an-espresso-machine.1581597/",
    sourcePlatform: "AnandTech Forums",
    sourceDate: "2005-04-21",
    summary:
      "A poster asked for \"something cheap that does the espresso shot and the milk foamy thing\" for an 8-person office, specifically asking whether anything existed under $100. Responses split sharply: several people vouched for pump-driven machines in the $30-$60 range (Melitta, a Target-brand pump machine) as perfectly good for occasional office use, while others argued a cheap machine produces \"bitter, watery shots with no crema\" and that it's worth spending $200-$300 (with coworkers chipping in) for one that lasts. The original poster ended up buying the ~$60 Target pump machine.",
    knownGaps:
      "No model number is given for the Target machine the poster bought, and there's no follow-up on how it performed after the initial purchase.",
    imageKey: "rancilio-silvia",
    imageIsRepresentative: true,
  },
  {
    id: "ref-cold-weather-sleeping-bag",
    title: "Sleeping bag for a camping novice, under $100, under 4lb",
    categoryId: "outdoors-fitness",
    sourceUrl: "https://forums.anandtech.com/threads/good-sleeping-bag.1796090/post-19023609",
    sourcePlatform: "AnandTech Forums",
    sourceDate: "2006-01-26",
    summary:
      "A self-described camping novice (FrugalGuy) asked for help picking a sleeping bag, with a $100 budget ceiling and a weight limit under 4lb for his 5'9\" frame. The most-repeated piece of advice was a warning that manufacturer temperature ratings run optimistic — \"a 50 degree bag is really only good for 60 degrees\" — so buyers should rate for colder than they expect to encounter. Specific recommendations included the Kelty Lightyear series (cheap and light) and a 0-degree Eddie Bauer bag from Target with a removable top layer for versatility across seasons.",
    knownGaps:
      "The thread doesn't confirm which bag the poster finally bought, and the premium alternatives mentioned (Marmot Hydrogen/Helium EQ) are explicitly noted as exceeding his stated budget, not a real option he considered seriously.",
    imageKey: null,
    imageIsRepresentative: false,
  },
  {
    id: "ref-prime-vs-zoom-lens",
    title: "35mm prime vs. the existing kit zoom, on a Nikon D5500",
    categoryId: "photography",
    sourceUrl: "https://forums.tomsguide.com/threads/buying-a-35mm-lens.183545/",
    sourcePlatform: "Tom's Guide Forums",
    sourceDate: "2018-03-25",
    summary:
      "A Nikon D5500 owner was deciding between two Nikon 35mm f/1.8 lenses (the DX and the pricier full-frame-compatible ED version) to pair with their existing kit zoom. The thread's accepted answer recommended the ED version, citing DxOMark test data showing it performs substantially better wide open at f/1.8, despite acknowledging its retrofocus design is technically unnecessary extra cost on a DX-format body.",
    knownGaps:
      "No budget figure was ever stated outright — the recommendation to spend more is inferred from the poster's own follow-up that the pricier lens was \"within reach,\" not a number given up front.",
    imageKey: null,
    imageIsRepresentative: false,
  },
  {
    id: "ref-office-headphones",
    title: "Budget noise-blocking headphones for a noisy open-plan office",
    categoryId: "audio",
    sourceUrl: "https://forums.anandtech.com/threads/advice-for-headphones.2286023/",
    sourcePlatform: "AnandTech Forums",
    sourceDate: "2012-11-27",
    summary:
      "A poster wanted headphones to block noisy coworkers, explicitly saying sound quality barely mattered since they'd mostly listen to YouTube, and later narrowed the budget to around $50 for an over-ear (not in-ear) pair. Recommendations included the ATH-M50 (~$100, praised for blocking noise with minimal leakage) and the Monoprice 8323, called \"a fantastic budget can\" by multiple repliers; one poster noted most closed-back headphones block enough noise without needing true active noise cancellation at all. The original poster leaned toward the Sennheiser HD201 (~$20) as a solid under-$50 pick.",
    knownGaps:
      "There's no confirmed final purchase in the thread — only which options the poster was leaning toward by the end of the discussion.",
    imageKey: "sennheiser-hd555",
    imageIsRepresentative: true,
  },
  {
    id: "ref-1440p-vs-4k-monitor",
    title: "1440p vs. 4K for a gaming monitor upgrade",
    categoryId: "gaming",
    sourceUrl: "https://www.rtings.com/monitor/reviews/best/1440p-gaming-monitors",
    sourcePlatform: "RTINGS.com (independent lab-tested reviews)",
    sourceDate: "2026",
    summary:
      "RTINGS, an independent review site that buys and lab-tests every monitor itself, frames the 1440p-vs-4K choice primarily as a frame-rate/GPU-budget trade-off: 4K typically runs 40-50% slower than 1440p at equivalent settings and needs significantly more GPU power to drive well, while native 1440p panels reach far higher refresh rates (240-360Hz) for competitive play. Their guidance for most buyers is a 27-inch 1440p monitor as the best balance of frame rate, latency, and desk fit, reserving 32-inch 4K for buyers with a high-end GPU and a preference for sharper visuals over raw speed.",
    knownGaps:
      "This is an editorial buying guide, not a single buyer's own purchasing story — there's no individual's budget or specific prior setup involved, just general test-backed guidance.",
    imageKey: null,
    imageIsRepresentative: false,
  },
  {
    id: "ref-air-fryer-buying-guide",
    title: "Which air fryer is actually worth it, after extensive testing",
    categoryId: "home-kitchen",
    sourceUrl: "https://www.tomsguide.com/best-picks/best-air-fryers",
    sourcePlatform: "Tom's Guide (editorial buying guide)",
    sourceDate: "2026",
    summary:
      "Tom's Guide's air fryer buying guide is built from a stated 500+ hours of hands-on testing across models, split into categories (best for most people, best dual-zone, best smart model, best small, best PFAS-free) rather than a single \"best overall\" pick — reflecting that the right air fryer depends heavily on household size and cooking habits, not just a single spec sheet.",
    knownGaps:
      "The full per-model pricing and test scores sit deeper in the article than could be independently re-verified here; this summary reflects only the guide's stated structure and methodology, not every individual model's numbers.",
    imageKey: "airfryer-5458",
    imageIsRepresentative: true,
  },
  {
    id: "ref-robot-vacuum-apartment",
    title: "Is a robot vacuum worth it, or is noise/suction a dealbreaker?",
    categoryId: "home-kitchen",
    sourceUrl: "https://forums.tomsguide.com/threads/best-vacuum-for-a-pet-free-3-bedroom-apartment-no-budget-restrictions.192828/",
    sourcePlatform: "Tom's Guide Forums",
    sourceDate: "2018-06-04",
    summary:
      "A poster with allergies and breathing issues asked for the best possible vacuum for a pet-free 3-bedroom apartment, with no budget limit, and was pointed toward Dyson and Miele as premium traditional vacuums. A later reply in the same discussion compared the trade-off directly against a robot vacuum: strong suction good enough for pet hair, but criticized as \"too loud\" for regular use — a real, specific downside rather than a purely positive recommendation.",
    knownGaps:
      "The original poster's constraints (allergies, no budget limit) are specific to them — the noise complaint about robot vacuums comes from a different commenter's own situation (with dogs), not the original poster's experience.",
    imageKey: "roomba-i7plus",
    imageIsRepresentative: true,
  },
];

export function getReferencesByCategory(categoryId: string): ExternalReference[] {
  return EXTERNAL_REFERENCES.filter((r) => r.categoryId === categoryId);
}

export function searchReferences(query: string, categoryId?: string): ExternalReference[] {
  const q = query.trim().toLowerCase();
  return EXTERNAL_REFERENCES.filter((r) => {
    if (categoryId && r.categoryId !== categoryId) return false;
    if (!q) return true;
    return r.title.toLowerCase().includes(q) || r.summary.toLowerCase().includes(q);
  });
}
