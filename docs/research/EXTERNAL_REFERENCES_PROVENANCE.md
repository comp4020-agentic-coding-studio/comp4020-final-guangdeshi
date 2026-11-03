# External references provenance

Per the "Discover Content Experience Refinement — real content" task: every
entry in `src/external-references.ts` is a genuine, independently verified
external discussion or buying guide — never an invented question, author,
product, price, or outcome. Each was fetched and read directly during
research (not inferred from a search-result snippet) on 2026-10-31. This
document records what was verified and what was explicitly left unknown,
same structure as `docs/research/IMAGE_PROVENANCE.md`.

## References

| ID | Source URL | Platform | Date | What was verified |
|---|---|---|---|---|
| `ref-budget-mechanical-keyboard` | [forums.anandtech.com/threads/non-gaming-keyboard-recommendation.2270390](https://forums.anandtech.com/threads/non-gaming-keyboard-recommendation.2270390) | AnandTech Forums | 2012-09-13 | Original poster's exact budget ($50) and the community's Unicomp/used-Model-M recommendations, fetched directly from the thread. |
| `ref-budget-espresso-machine` | [forums.anandtech.com/threads/recommend-me-an-espresso-machine.1581597](https://forums.anandtech.com/threads/recommend-me-an-espresso-machine.1581597/) | AnandTech Forums | 2005-04-21 | Original poster's use case (8-person office, under-$100 ask) and the pump-vs-steam price debate, with the poster's final ~$60 purchase decision. |
| `ref-cold-weather-sleeping-bag` | [forums.anandtech.com/threads/good-sleeping-bag.1796090](https://forums.anandtech.com/threads/good-sleeping-bag.1796090/post-19023609) | AnandTech Forums | 2006-01-26 | Original poster's exact constraints ($100 budget, under 4lb, 5'9" frame) and the community's temperature-rating-is-optimistic warning. |
| `ref-prime-vs-zoom-lens` | [forums.tomsguide.com/threads/buying-a-35mm-lens.183545](https://forums.tomsguide.com/threads/buying-a-35mm-lens.183545/) | Tom's Guide Forums | 2018-03-25 | Original poster's camera model (Nikon D5500) and the two exact lens options being compared, plus the accepted answer's DxOMark-based reasoning. |
| `ref-office-headphones` | [forums.anandtech.com/threads/advice-for-headphones.2286023](https://forums.anandtech.com/threads/advice-for-headphones.2286023/) | AnandTech Forums | 2012-11-27 | Original poster's use case and later-stated $50/over-ear constraint, and the specific models recommended (ATH-M50, Monoprice 8323, Sennheiser HD201) with prices as stated by repliers. |
| `ref-1440p-vs-4k-monitor` | [rtings.com/monitor/reviews/best/1440p-gaming-monitors](https://www.rtings.com/monitor/reviews/best/1440p-gaming-monitors) | RTINGS.com | 2026 | RTINGS' own stated testing methodology (independently purchased and lab-tested units) and its general 1440p-vs-4K frame-rate/GPU-budget guidance. |
| `ref-air-fryer-buying-guide` | [tomsguide.com/best-picks/best-air-fryers](https://www.tomsguide.com/best-picks/best-air-fryers) | Tom's Guide | 2026 | The article's stated testing scale (500+ hours) and its category-based structure (best overall, dual-zone, smart, small, PFAS-free) rather than a single "best" pick. |
| `ref-robot-vacuum-apartment` | [forums.tomsguide.com/threads/best-vacuum-for-a-pet-free-3-bedroom-apartment-no-budget-restrictions.192828](https://forums.tomsguide.com/threads/best-vacuum-for-a-pet-free-3-bedroom-apartment-no-budget-restrictions.192828/) | Tom's Guide Forums | 2018-06-04 | Original poster's exact constraints (allergies, pet-free, no budget limit) and a later commenter's real noise/suction trade-off experience with a robot vacuum. |

## Candidates researched and explicitly rejected

So the record shows what was checked and ruled out, not only what was kept:

- **Reddit r/buildapcforme, r/backpacking, r/CampingGear threads**: searched specifically but no live, directly-quotable thread was found and independently verified during this research pass (search results returned retailer product listings instead of actual threads). Per the task's explicit instruction not to scrape Reddit or bulk-copy its content, no Reddit thread is used here — AnandTech and Tom's Guide forums provided equivalent real community discussions that could be directly fetched and read.
- **OutdoorGearLab articles**: explicitly not used as a source for any reference entry or its photography, per the task's explicit prohibition on republishing OutdoorGearLab's copyrighted reviews/photos/testing data without permission.
- **A ninth candidate on mid-range laptops for a CS degree**: dropped — this topic is already well covered by an existing demo scenario ("Which laptop for a CS degree"), and a near-duplicate external reference would add redundancy rather than new category coverage.

## Image provenance for references

| File | Source | Author | License | Used for | Representative? |
|---|---|---|---|---|---|
| `src/public/assets/references/keychron-k8.jpg` | [File:Keychron K8 Non-Backlight Wireless Mechanical Keyboard.jpg](https://commons.wikimedia.org/wiki/File:Keychron_K8_Non-Backlight_Wireless_Mechanical_Keyboard.jpg) | Thomas Vogt | CC BY 2.0 — requires attribution | `ref-budget-mechanical-keyboard` | Yes — the thread discusses buckling-spring boards (Unicomp/Model M), not a Keychron; this is a generic "mechanical keyboard" category photo, explicitly labelled as representative, not the exact model discussed. |
| `src/public/assets/references/rancilio-silvia.jpg` | [File:RANCILIO SILVIA espresso machine.jpg](https://commons.wikimedia.org/wiki/File:RANCILIO_SILVIA_espresso_machine.jpg) | Jmak | CC BY-SA 3.0 — requires attribution | `ref-budget-espresso-machine` | Yes — the thread never names a specific machine model; this is a representative espresso machine photo. |
| `src/public/assets/references/airfryer-5458.jpg` | [File:Air Fryer 5458.jpg](https://commons.wikimedia.org/wiki/File:Air_Fryer_5458.jpg) | Ashley Pomeroy | CC BY 4.0 — requires attribution | `ref-air-fryer-buying-guide` | Yes — a generic air fryer photo representing the category the guide covers, not any one specific tested model. |
| `src/public/assets/references/roomba-i7plus.jpg` | [File:IRobot Roomba i7+.jpg](https://commons.wikimedia.org/wiki/File:IRobot_Roomba_i7%2B.jpg) | Auledas | CC BY-SA 4.0 — requires attribution | `ref-robot-vacuum-apartment` | Yes — the thread discusses robot vacuums generally (a Roomba is mentioned by one commenter), not this exact model. |
| `src/public/assets/references/sennheiser-hd555.jpg` | [File:Headphones-Sennheiser-HD555.jpg](https://commons.wikimedia.org/wiki/File:Headphones-Sennheiser-HD555.jpg) | Adamantios | CC BY-SA 3.0 — requires attribution | `ref-office-headphones` | Yes — the thread discusses the ATH-M50/Monoprice 8323/Sennheiser HD201, not the HD555; representative "headphones" category photo only. |

Three references (`ref-cold-weather-sleeping-bag`, `ref-prime-vs-zoom-lens`,
`ref-1440p-vs-4k-monitor`) have **no photo at all** rather than a mismatched
or reused one — no suitable distinct licensed photo was sourced for them
without either duplicating an image already used elsewhere in the app or
forcing a visually unrelated stand-in. `referenceCard()` (`src/render.ts`)
renders an explicit "no photo available" placeholder for these rather than
silently reusing another entry's image.

Every image file above lives under `src/public/assets/references/` and is
served as a static asset via `/static/assets/references/<file>`
(`src/server.ts`'s existing `handleStatic` route) — never uploaded through
`src/images.ts`'s `images` table, since that table's `owner_user_id` is a
required foreign key to a real registered user and a reference has no
author. Required attribution text is rendered directly on each reference's
card in `referenceCard()`, not only recorded here.

## What was explicitly NOT done

- No Reddit content was scraped, bulk-copied, or embedded.
- No OutdoorGearLab review text, photos, or testing data were used.
- No fake local user, vote, comment, or outcome was created for any
  reference — references are not rows in `posts`, `opinions`, or
  `post_outcomes` at all.
- No price, product, author, or outcome was invented where a source didn't
  state one — see each entry's `knownGaps` field in
  `src/external-references.ts`.
