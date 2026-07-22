# Runtime stack registry

Container names are not environment identity.

See also: **`docs/operator/runtime-identity.md`** (canonical roles, headers, verifiers, ACTIVE_PUBLIC).

## Server path

`/srv/woodright/runtime-ownership/STACKS.json`

After mid-cycle cutovers, STACKS digests may lag. Prefer `/srv/woodright/runtime-identity/ACTIVE_PUBLIC.json` + live Traefik for public identity.

## Public pair = `public_demo`

Traefik routes `woodright-demo.ru` → `woodright-staging-storefront:3002` and API → `woodright-staging-backend:9000`.

Despite the word `staging` in the name, this is the **public_demo** pair for the active public route.

Report as: `public_demo (legacy staging containers)`.

## `woodright-production-*` = `non_public_candidate`

Observed role: **non_public_candidate** (legacy alias in older files: `production_candidate`).

- localhost only: `3200` / `9200` / `5433`
- own postgres/redis/media volumes
- not in Traefik public routes
- **forbidden as public evidence** (public verifier fail-closed on `:9200`)

Report as: `non_public_candidate (legacy production containers)`.

## Candidate `e34388f`

`preserved_candidate` on `3032/9032`. Review date starts audit only - not cleanup permission.

## Validators

- `validate-stack-registry.cjs`
- `validate-public-route-uniqueness.cjs`
- `validate-runtime-identity.cjs`
- `verify-public-runtime-identity.cjs` / `verify-candidate-runtime-identity.cjs`
