# Environment-scoped mutation authority (Woodright)

Mutating release scripts require explicit:

```bash
--environment staging
# or
--environment production
```

No default. Inherited `WOODRIGHT_ENVIRONMENT` alone is not authority (conflicts fail-closed).

## Profiles

- `ops/config/runtime-environments/staging.conf` - public demo (`woodright-demo.ru`)
- `ops/config/runtime-environments/production.conf` - private production **candidate** on the same VM (loopback `:3200`/`:9200`). Not public `woodright.ru`.

Dokploy project/app UUIDs are often absent on container labels; profiles pin compose directory/project, name prefixes, media volume, DB name, ownership dir, and lock path.

## Locks

| Environment | Lock |
|-------------|------|
| staging | `/srv/woodright/locks/live-cutover.lock` (canonical; unchanged) |
| production | `/srv/woodright/locks/production-cutover.lock` |

Lock is necessary but not sufficient: wrong profile fails before Docker mutation even if the other lock is free.

Empty lock files are normal for `flock`; holders via `lsof`/`lslocks` are authoritative. Sidecar `.meta` is non-mutex.

## Ownership isolation

| Environment | Manifest root |
|-------------|---------------|
| staging | `/srv/woodright/runtime-ownership/` |
| production | `/srv/woodright/runtime-ownership-production/` |

## Validation freeze

`ops/lib/woodright-validation-freeze.sh` - bounded lease for QA windows. Mutators refuse while unexpired unless audited override.

## Fidelity

```bash
bash scripts/ops/test-environment-governance-fidelity.sh
```

## Validation freeze hold for QA cycles

Official deep validation / stability watches on staging should hold a bounded freeze:

```bash
source ops/lib/woodright-hold-validation-freeze.sh
wr_hold_validation_freeze_for_command staging \
  "qa-operator" "cycle-id" "bounded-validation" 1800 -- \
  ./your-validation-entrypoint.sh --environment staging
```

Ordinary one-off public curl does not require a freeze. Mutators refuse an active freeze unless an audited override is set.
Storefront digest cutovers must use `ops/release/recreate-staging-storefront.sh` (inherits OCI labels from the image; do not copy previous container Labels).
