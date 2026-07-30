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
