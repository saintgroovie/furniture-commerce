# Catalog data quality audit (read-only)

## Command

```sh
node scripts/catalog/audit-catalog-data-quality.cjs \
  --out /path/to/durable/dir \
  --api 'https://api.example/store/products?limit=500' \
  --release-sha <40-char-sha>
```

Or with a fixture:

```sh
node scripts/catalog/audit-catalog-data-quality.cjs \
  --out /path/to/durable/dir \
  --fixture scripts/catalog/fixtures/sample-products.json
```

## Outputs

- `catalog-data-quality-inventory.json`
- `catalog-owner-review.csv`
- `catalog-data-quality-summary.md`
- `catalog-data-quality-baseline.json` (aggregate counts only)
- `SHA256SUMS`

## Policy

- GET-only (no POST/PUT/PATCH/DELETE to catalog/admin)
- `auto_mutation_allowed: false` on every row
- `/tmp` is temporary; keep a durable copy under `/srv/woodright/reports/…` or a non-iCloud owner path
- Metadata gaps are findings, not CI failures

Aggregate sample baseline (no product dump): `docs/data/catalog-data-quality-baseline.sample.json`
