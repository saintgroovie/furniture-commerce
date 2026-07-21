# Post-deploy verification

## Public verifier (read-only)

```bash
export WOODRIGHT_PLAYWRIGHT_PATH=/path/to/playwright   # if needed
node scripts/release/verify-public-catalog.cjs \
  --base https://woodright-demo.ru \
  --samples 5 \
  --out /tmp/woodright-public-verify.json
```

Checks:

- `/`, `/catalog`, `/kids/catalog`
- first DOM card is not a pure accessory
- mirror index after furniture
- invalid sort returns merchandising first card
- `price_asc` / `price_desc` change first card
- ≥5 repeated catalog samples stable

Does **not** mutate catalog, cart, or DNS.

## API marker (supporting)

`x-woodright-catalog-order: merchandising-v1` on `GET /store/catalog-products` supports identity but does not replace DOM proof.

## Five race samples

Required for `done_deployed_and_verified`. Divergence implies competing owner, stale replica, or cache split.
