# Runtime stack registry

Container names are not environment identity (rule 86).

## Server path

`/srv/woodright/runtime-ownership/STACKS.json`

## Public pair

Traefik routes `woodright-demo.ru` → `woodright-staging-storefront:3002` and API → `woodright-staging-backend:9000`.

Despite the word `staging` in the name, this is the **public_demo** pair for the active bundle.

## `woodright-production-*`

Observed role: **production_candidate** (rehearsal).

- localhost only: `3200` / `9200` / `5433`
- own postgres/redis/media volumes
- not in Traefik public routes
- created ~2026-07-21T20:05Z
- do not stop/delete without explicit owner approval

## Candidate `e34388f`

`preserved_candidate` on `3032/9032`. Review date starts audit only - not cleanup permission.

## Validators

- `validate-stack-registry.cjs`
- `validate-public-route-uniqueness.cjs`
