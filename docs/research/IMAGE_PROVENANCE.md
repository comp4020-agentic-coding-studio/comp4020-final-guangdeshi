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
| `docs/assets/demo-source-images/headphones.svg` | [File:Headphones (1292150) - The Noun Project.svg](https://commons.wikimedia.org/wiki/File:Headphones_(1292150)_-_The_Noun_Project.svg) | andriwidodo (via The Noun Project) | CC0 1.0 Universal | 2026-10-31 |
| `docs/assets/demo-source-images/backpack.jpg` | [File:Hiker with a large backpack (Unsplash).jpg](https://commons.wikimedia.org/wiki/File:Hiker_with_a_large_backpack_(Unsplash).jpg) | Jake Melara (Unsplash, pre-2017-06-05) | CC0 1.0 Universal | 2026-10-31 |

### Attribution text used in-app (where the license requires it)

- Mac mini photo (CC BY 4.0): "Photo by Seasider53, Wikimedia Commons, CC BY 4.0" — shown in the demo scenario's description where this image is used, since CC BY requires visible attribution wherever the work is reused, not just in this manifest.
- The other three (public domain / CC0) require no attribution, but the source is recorded here for transparency regardless.

All four source files are re-encoded through `src/images.ts`'s
`processAndStoreImage` — the same path every real user upload goes
through — which strips any residual metadata and produces the actual
stored JPEG, so the files committed under `docs/assets/demo-source-images/`
are kept only as the original, source-of-truth copies with their licenses
intact; they are not served directly to visitors.

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
