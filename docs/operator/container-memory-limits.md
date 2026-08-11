# Container memory limits (Wave 1)

## Purpose

Reduce host-wide OOM blast radius when a single Node.js process (storefront or Medusa backend) grows without bound. Limits are measurement-backed for the dual-stack VM (~8 GiB RAM).

## Wave 1 defaults (measurement-backed)

| Workload | Reservation | Hard Memory | MemorySwap | Basis |
| -------- | ----------: | ----------: | ---------: | ----- |
| Storefront (prod + public_demo) | 192 MiB | 512 MiB | 512 MiB | cgroup peak ~179 - 193 MiB; floor 512 MiB |
| Backend (prod + public_demo) | 640 MiB | 1536 MiB | 1536 MiB | cgroup peak ~529 - 638 MiB; ≥2× peak / ≥1 GiB |

Exact bytes: `192→201326592`, `512→536870912`, `640→671088640`, `1536→1610612736`.

Policy helpers: `ops/lib/woodright-memory-limits.sh`

## MemorySwap contract (required)

Accepted Woodright application policy:

`MemorySwap == Memory` (hard limit)

Docker Engine (observed 29.x) rejects setting `--memory` alone when current `MemorySwap=0`. Every apply / create path must set the triplet atomically:

* `--memory-reservation`
* `--memory`
* `--memory-swap` (equal to `--memory`)

Compose keys: `mem_reservation` / `mem_limit` / `memswap_limit`.

## Canonical sources (recreate persistence)

| Stack | Authority |
| ----- | --------- |
| public_demo Compose | `docker-compose.staging.yml` (`mem_reservation` / `mem_limit` / `memswap_limit`) |
| public_demo docker create | `ops/release/recreate-staging-*.sh` injects `--memory*` + `--memory-swap` |
| production Compose | `ops/compose/woodright-production.docker-compose.yml` |
| Live apply (optional) | `ops/release/apply-memory-limits-resource-only.sh` |

**Canonical model:** containers are created already limited. Do not rely on post-create `docker update` after every cutover.

## Runtime apply (optional)

Safe with separate owner approval:

* unlimited → accepted Wave 1 limits;
* accepted limits → other **nonzero** limits.

Idempotent when already exact.

## Runtime rollback (Docker Engine 29.6.1)

Platform limitation:

`DOCKER29_RUNTIME_UNLIMITED_ROLLBACK_REQUIRES_RECREATE`

Observed: `docker update --memory 0 ...` does **not** clear hard Memory / cgroup.max back to unlimited.

Supported resource-only restore:

* limited A → limited B (nonzero triplet)

Unsupported:

* limited → `0/0/0` unlimited

Helper behavior: fail-closed **before** any Docker mutation and emit:

`RESOURCE_ROLLBACK_TO_UNLIMITED_REQUIRES_RECREATE`

A true return to unlimited requires a separate **owner-approved recreate** of the exact previous release/config - never automatic from this helper.

## Known temporary runtime asymmetry

Until the next approved public_demo recreate/cutover:

* production may already be limited (historical resource-only apply);
* a newer public_demo hotfix may still be unlimited `0/0/0`.

That asymmetry is temporary. After merge, the **next** approved recreate/cutover must create containers with canonical triplets without a manual reapply.

## Capacity note (~8 GiB)

Dual-stack Wave 1 reservations (~1664 MiB) leave ≥1.5 GiB host reserve target. A temporary third application pair is **not** safe as a steady-state neighbour on this VM.

## Deferred (not Wave 1)

- PostgreSQL / Redis
- Dokploy / Traefik platform limits

## Staging recreate helpers (P1 dry-run safety)

`recreate-staging-backend-with-media.sh` and `recreate-staging-storefront.sh` require an explicit `--mode`:

- `--mode dry-run` — plan only (zero Docker mutation; prints planned memory flags from `woodright-memory-limits.sh`)
- `--mode execute` — live stop/rename/create/start

Missing `--mode` fails closed with `RECREATE_MODE_REQUIRED` (never defaults to execute).
Pair cutover passes `--mode execute` to the backend leaf.
