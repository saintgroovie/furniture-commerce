# Catalog data quality audit (read-only)

## Authoritative source

For Woodright merchandising fields (`category_handle`, collection label), prefer:

`/store/catalog-products` → `metadata.category_handle` / `metadata.collection`

Do **not** treat absence of top-level fields on `/store/products` as proof the catalog data is missing (rule 73). That is often a **DTO / projection gap**.

## Compare mode (recommended for live)

```sh
node scripts/catalog/compare-catalog-sources.cjs \
  --out /path/to/durable/dir \
  --list-api 'https://api.example/store/products?limit=500' \
  --auth-api 'https://api.example/store/catalog-products?limit=500' \
  --bundle-id wrb-… \
  --backend-revision <40> \
  --storefront-revision <40> \
  --backend-digest sha256:… \
  --storefront-digest sha256:…
```

Outputs include `field-source-matrix.json`, `dto-gaps.csv`, `owner-review.csv`, `summary.md`.

## Single-endpoint audit

```sh
node scripts/catalog/audit-catalog-data-quality.cjs \
  --out /path/to/durable/dir \
  --mode catalog-projection \
  --api 'https://api.example/store/catalog-products?limit=500' \
  --bundle-id wrb-… \
  --backend-revision <40> \
  --storefront-revision <40>
```

Or with a fixture:

```sh
node scripts/catalog/audit-catalog-data-quality.cjs \
  --out /path/to/durable/dir \
  --fixture scripts/catalog/fixtures/sample-catalog-products.json
```

## Field states

- `present_structured`
- `null_in_source` / `missing_in_source`
- `not_exposed_by_endpoint` / `lost_in_projection`
- `derived_from_title` (secondary; after structured check)
- `ambiguous` / `unknown`

Never map `not_exposed_by_endpoint` → `missing_in_catalog_data`.

## Policy

- GET-only (no POST/PUT/PATCH/DELETE to catalog/admin)
- `automatic_apply: false` / `mutation_status: none`
- packets name `bundle_id` + BE/SF revisions + digests
- `/tmp` is temporary; durable under `/srv/woodright/reports/…` or owner artifacts path
