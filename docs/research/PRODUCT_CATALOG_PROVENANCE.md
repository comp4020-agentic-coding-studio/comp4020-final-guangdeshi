# Product catalog provenance

Discover's Products view, product pages and catalog-linked posts are built on
a small, curated product catalog. This file records where every catalog
record and photo came from, under what licence, and how it was selected.

## Source

| | |
|---|---|
| Dataset | Amazon Berkeley Objects (ABO) |
| Home page | https://amazon-berkeley-objects.s3.us-east-1.amazonaws.com/index.html |
| Licence | Creative Commons Attribution 4.0 International (CC BY 4.0), https://creativecommons.org/licenses/by/4.0/ |
| Data and image credit | Amazon.com |
| Dataset built by | Matthieu Guillaumin, Thomas Dideriksen, Kenan Deng, Himanshu Arora, Arnab Dhua, Xi (Brian) Zhang, Tomas Yago-Vicente (Amazon.com); Jasmine Collins, Shubham Goel, Jitendra Malik (UC Berkeley) |
| Paper | Collins et al., "ABO: Dataset and Benchmarks for Real-World 3D Object Understanding", CVPR 2022 (arXiv 2110.06199) |
| Retrieved | 2026-10-31 |

ABO is a public research dataset of real Amazon product listings (multilingual
metadata) and their real catalog photos, released for reuse under CC BY 4.0.
That licence permits redistribution and adaptation with attribution and an
indication of changes. This app gives that attribution on every product page
(photo credit line), in the site footer ("Product data & image credits"), and
on `/credits`.

**Changes made:** images resized to at most 1200px on the long edge and
re-encoded as JPEG (metadata stripped, transparency flattened to white);
product names shortened for display (each product page keeps the original
catalog title under "Listed features"); only English-language fields kept;
up to four feature bullets kept per product.

## What was downloaded

Only what was needed — never the 110GB image archive or the 3D models:

- `listings/metadata/listings_*.json.gz` (product metadata, a few MB each);
- `images/metadata/images.csv.gz` (image id → path and dimensions);
- one original image per selected product, fetched individually from
  `images/original/<path>` on the dataset's S3 bucket.

Raw downloads stayed in a scratch directory outside the repo. The repo holds
the curated selection (`data-sources/abo-catalog-selection.json`), the
generated manifest (`src/catalog-manifest.json`) and 72 optimized JPEGs
(`src/public/catalog/`, about 5MB in total).

## Selection method

1. Filter the listings to records with an English item name, a main image,
   and a product type that maps cleanly onto one of the app's own categories.
2. Keep only images whose recorded original size is at least 1000px on the
   short edge.
3. Read each candidate's real listing record and visually inspect its real
   photo (contact sheet), dropping weak photos, near-duplicates and products
   whose photo doesn't show the product.
4. Balance across categories, aiming for 50–80 products.

Result: **72 products**, one photo each.

| Category | Products |
|---|---|
| Home & Kitchen | 18 |
| Audio | 9 |
| Fashion & Accessories | 8 |
| Outdoors & Fitness | 8 |
| Gaming | 6 |
| Books & Hobbies | 6 |
| Photography | 6 |
| Vehicles & Gear | 6 |
| Computing & Tech | 5 |
| Other | 0 (deliberately left empty) |

**Known bias:** ABO is drawn mostly from Amazon's own brands. 67 of the 72
products are AmazonBasics (47) or another Amazon house brand (Stone & Beam,
find., Rivet, Ravenna Home, Solimo, AmazonCommercial, Symbol, Pinzon, 206
Collective, UMI); the other 5 have no brand recorded in the listing. ABO has very few cameras, bikes or premium electronics, so
those categories are thinner than real shoppers would want. Custom
(non-catalog) products remain fully supported for exactly this reason.

### Rejected

| ABO item | Reason |
|---|---|
| B07TVRZZWB | main image is an AmazonBasics logo, not a product photo |
| B07PW6PTC5 | main image is an AmazonBasics logo, not a product photo |

The importer also rejects, automatically, any image that fails to decode,
whose decoded size doesn't match the dataset's recorded size, or whose short
edge is under 1000px. The final run rejected none.

## What the catalog never contains

ABO listings carry no live price, stock, rating or review data, and the app
never invents any. A catalog product has **no price, rating, review count,
stock status, discount or "popular" signal**. The only engagement shown for a
product is a live count of real, public, non-demo Buy or Pass posts that link
to it. Prices come only from the buyer ("Price you've been offered"), as part
of their own post. ABO records are a snapshot of past listings, so nothing
here claims a product is currently sold, available or priced at any amount.

## Storage and provenance fields

- `catalog_import_sources`: the dataset, its URL, licence, licence URL,
  attribution text and retrieval date.
- `catalog_products`: a stable id `abo-<item id>`, the source item id and
  marketplace domain, the app category, display name, **original title**,
  brand, product type, one key attribute, and listed features.
- `catalog_product_images`: the source image id, its **original source URL**,
  the local file, and both original and stored dimensions.
- `catalog_product_attributes`: factual attributes only (colour, material,
  model, weight, dimensions).

## Re-running

```sh
node scripts/import-product-catalog.ts          # rebuild manifest; download only missing images
node scripts/import-product-catalog.ts --apply  # ...and upsert into DATABASE_PATH
```

The server also upserts `src/catalog-manifest.json` at boot. Both paths are
idempotent: they are keyed on the stable id, never delete a catalog product,
and never touch posts, opinions or users.
