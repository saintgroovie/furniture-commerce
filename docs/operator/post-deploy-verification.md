# Post-deploy verification


## Runtime identity gate (fail-closed)

Before treating any probe as public evidence:

```bash
bash scripts/verify-public-runtime-identity.sh \
  --url https://api.woodright-demo.ru/health \
  --identity-file /srv/woodright/runtime-identity/ACTIVE_PUBLIC.json
```

`http://127.0.0.1:9200` and `localhost` are **invalid_public_evidence**.

See `docs/operator/runtime-identity.md`.

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
