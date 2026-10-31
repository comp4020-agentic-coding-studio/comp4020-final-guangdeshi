# Image provenance (demo content)

Per the brief's explicit requirement: every image used in the 18-24 demo
scenarios (Feature D) is either (a) a real photograph with a verified
reusable license, attributed here, or (b) an original illustration
generated locally with `sharp`/SVG — never a paid generation API, never an
unlicensed or copyright-unclear image. Each license below was checked
directly against the Wikimedia Commons file page (not inferred from a
search snippet) before downloading.

## Real, licensed photographs

| File | Source | Author | License | Verified |
|---|---|---|---|---|
| `docs/assets/demo-source-images/macmini.jpg` | [File:Mac mini 2024 M4.jpg](https://commons.wikimedia.org/wiki/File:Mac_mini_2024_M4.jpg) | Seasider53 | CC BY 4.0 — requires attribution | 2026-10-31 |
| `docs/assets/demo-source-images/sleepingbag.jpg` | [File:Mummy bag.jpg](https://commons.wikimedia.org/wiki/File:Mummy_bag.jpg) | Smack (own work, 2006) | Public domain (self-dedicated) — no attribution legally required | 2026-10-31 |
| `docs/assets/demo-source-images/headphones.jpg` | [File:Headphones-Sennheiser-HD555.jpg](https://commons.wikimedia.org/wiki/File:Headphones-Sennheiser-HD555.jpg) | Adamantios (2007) | CC BY-SA 3.0 — requires attribution | 2026-10-31 |
| `docs/assets/demo-source-images/backpack.jpg` | [File:Hiker with a large backpack (Unsplash).jpg](https://commons.wikimedia.org/wiki/File:Hiker_with_a_large_backpack_(Unsplash).jpg) | Jake Melara (Unsplash, pre-2017-06-05) | CC0 1.0 Universal | 2026-10-31 |
| `docs/assets/demo-source-images/espresso.jpg` | [File:RANCILIO SILVIA espresso machine.jpg](https://commons.wikimedia.org/wiki/File:RANCILIO_SILVIA_espresso_machine.jpg) | Jmak (2011) | CC BY-SA 3.0 — requires attribution | 2026-10-31 |
| `docs/assets/demo-source-images/airfryer.jpg` | [File:Air Fryer 5458.jpg](https://commons.wikimedia.org/wiki/File:Air_Fryer_5458.jpg) | Ashley Pomeroy (2024) | CC BY 4.0 — requires attribution | 2026-10-31 |
| `docs/assets/demo-source-images/roomba.jpg` | [File:IRobot Roomba i7+.jpg](https://commons.wikimedia.org/wiki/File:IRobot_Roomba_i7%2B.jpg) | Auledas | CC BY-SA 4.0 — requires attribution | 2026-10-31 |

### Replaced file: `headphones.svg` → `headphones.jpg` (2026-10-31)

The original `headphones.svg` (File:Headphones (1292150) - The Noun Project.svg,
CC0) was a 100×100px flat line-icon silhouette, not a product photograph.
Rasterized at its native size and placed on the illustration-style dark
background used for the post card, it rendered as a near-solid black
square — found by actually opening the rendered card's image file, not
assumed from the source existing. Replaced with a genuine photograph
(`headphones.jpg` above). The old SVG file has been deleted from the repo;
it is no longer referenced anywhere.

### Attribution text used in-app (where the license requires it)

- Mac mini photo (CC BY 4.0): "Photo by Seasider53, Wikimedia Commons, CC BY 4.0"
- Headphones photo (CC BY-SA 3.0): "Photo by Adamantios, Wikimedia Commons, CC BY-SA 3.0"
- Espresso machine photo (CC BY-SA 3.0): "Photo by Jmak, Wikimedia Commons, CC BY-SA 3.0"
- Air fryer photo (CC BY 4.0): "Photo by Ashley Pomeroy, Wikimedia Commons, CC BY 4.0"
- Robot vacuum photo (CC BY-SA 4.0): "Photo by Auledas, Wikimedia Commons, CC BY-SA 4.0"

Each is shown in the demo scenario's own description where that image is
used, since CC BY/CC BY-SA requires visible attribution wherever the work
is reused, not just in this manifest (see `CC_BY_ATTRIBUTION` in
`scripts/seed-demo-content.ts`). The sleeping bag and backpack photos
(public domain / CC0) require no attribution, but their sources are
recorded here for transparency regardless.

All seven source files are re-encoded by `scripts/seed-demo-content.ts`'s
own `storeRealImage` (same `sharp(...).rotate().jpeg()` re-encode
discipline as `src/images.ts`'s `processAndStoreImage`, applied separately
here since seeding runs outside the HTTP upload path), which strips any
residual metadata and produces the actual stored JPEG, so the files
committed under `docs/assets/demo-source-images/` are kept only as the
original, source-of-truth copies with their licenses intact; they are not
served directly to visitors.

## Original illustrations (no photograph researched/found/licensed)

For every other demo scenario category (photography, fashion, audio beyond
headphones, home tech, travel/sports, general consumer goods), no real
photograph was sourced — per the brief's explicit instruction not to block
development when a suitable licensed image can't be found. These use
simple, original SVG/sharp-composited illustrations generated locally by
`scripts/seed-demo-content.ts` (solid background + a text label identifying
the product category) — the same technique used for this project's earlier
synthetic demo images (see `PROCESS.md`'s migration history). These are
wholly original works with no provenance concerns.

## What was explicitly NOT done

- No images were scraped from retailer or review sites (OutdoorGearLab,
  Amazon, etc.) — those are copyrighted editorial/commercial photography,
  not reusable.
- No paid image-generation API was used.
- No image was used without first reading its actual Commons license
  template text directly (not just a search-result snippet claiming a
  license).
