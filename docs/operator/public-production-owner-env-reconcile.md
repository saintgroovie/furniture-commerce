# Public production owner-env reconcile (storefront, same-image)

Identity-preserving recreate of **only** `woodright-public-production-storefront` so the running process sees already-recorded owner legal keys.

This is **not** DNS, Traefik write, pair cutover, image/SHA change, backend recreate, demo mutation, or candidate mutation.

Notification `admin_polling` / `accepted` is **monitor and profile only**. Do not inject it into container env.

Payment `manual_invoice` / `accepted_manual` is already green on the profile/monitor. Do not recreate to flip leftover container `pending`.

`docker restart` does **not** inject changed env. Do not use it.

## Why it exists

Accepted application SHA `caf82b0` storefront uses `isLegalLaunchComplete()`, which requires runtime:

```
WOODRIGHT_LEGAL_PACK_TOKEN=OWNER_LEGAL_CONTENT_APPROVED
```

Ops profile after PR #224 already records that token. Live Dokploy compose YAML / `.env` / container `Config.Env` may still lack it. That is `PUBLIC_PRODUCTION_RUNTIME_LEGAL_TOKEN_NOT_APPLIED`.

## Canonical helper

```
ops/release/reconcile-public-production-owner-env.sh
```

Planner (no Docker):

```
ops/lib/woodright-public-production-owner-env.py
```

Lock (execute only): `/srv/woodright/locks/public_production/live-cutover.lock`

Confirm token (execute only): `I_UNDERSTAND_PUBLIC_PRODUCTION_OWNER_ENV_RECONCILE`

## Dry-run (default, this launch cycle)

```sh
bash /srv/woodright/ops/release/reconcile-public-production-owner-env.sh \
  --environment public_production \
  --component storefront \
  --mode dry-run
```

Read-only. Desired token: `PUBLIC_PRODUCTION_OWNER_ENV_RECONCILE_DRY_RUN_PASS`.

## Execute (DO NOT RUN WITHOUT OWNER AUTHORIZATION)

```sh
bash /srv/woodright/ops/release/reconcile-public-production-owner-env.sh \
  --environment public_production \
  --component storefront \
  --mode execute \
  --confirm-mutation I_UNDERSTAND_PUBLIC_PRODUCTION_OWNER_ENV_RECONCILE
```

Must retain:

- storefront and backend image digests
- application source SHA
- runtime role and DB identity
- production compose network
- `dokploy-network` (reconnect with the storefront alias if Compose drops it)
- Traefik YAML bytes
- DNS
- backend container ID
- demo / candidate containers

Env delta (storefront only):

- `WOODRIGHT_LEGAL_CONTENT_STATUS=approved`
- `WOODRIGHT_LEGAL_PACK_TOKEN=OWNER_LEGAL_CONTENT_APPROVED`

If live Dokploy YAML is missing the pack-token interpolation line, the helper inserts it after the single `WOODRIGHT_LEGAL_CONTENT_STATUS` line. Image pins in compose `.env` are validated unchanged.

Rollback: restore backed-up YAML + `.env`, force-recreate storefront, reconnect `dokploy-network`.

## What this helper must never do

- `gcloud dns` / `nsupdate` / ITB write / TTL change
- Traefik file replace
- `cutover-public-production-pair.sh` / apex routing execute
- backend `--force-recreate`
- payment or notification env writes
- `docker commit` / image rebuild

SSH identity is operator input. Do not hardcode a machine-specific private-key path in this repo.
