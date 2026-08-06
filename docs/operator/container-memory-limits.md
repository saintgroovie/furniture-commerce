# Container memory limits (Wave 1)

## Purpose

Reduce host-wide OOM blast radius when a single Node.js process (storefront or Medusa backend) grows without bound. Limits are measurement-backed for the dual-stack VM (~8 GiB RAM).

## Wave 1 defaults (2026-08-06 evidence)

| Workload | Reservation | Hard limit | Basis |
| -------- | ----------: | ---------: | ----- |
| Storefront (prod + public_demo) | 192 MiB | 512 MiB | cgroup peak ~189 - 193 MiB; floor 512 MiB |
| Backend (prod + public_demo) | 640 MiB | 1536 MiB | cgroup peak ~576 - 638 MiB; ≥2× peak / ≥1 GiB |

Policy helpers: `ops/lib/woodright-memory-limits.sh`

## Canonical sources

| Stack | Authority |
| ----- | --------- |
| public_demo Compose | `docker-compose.staging.yml` (`mem_reservation` / `mem_limit`) |
| public_demo docker create | `ops/release/recreate-staging-*.sh` injects `--memory*` |
| production Compose | `ops/compose/woodright-production.docker-compose.yml` → install to Dokploy path |
| Live apply (no cutover) | `ops/release/apply-memory-limits-resource-only.sh` (`docker update`) |

## Resource-only apply (preferred for limit rollout)

Does **not** rewrite `ACTIVE_OWNER` / `EXPECTED_RELEASE`, digests, env, mounts, or networks.

```bash
ops/release/apply-memory-limits-resource-only.sh --mode dry-run --targets all \
  --production-compose /etc/dokploy/compose/woodright-production/code/docker-compose.yml \
  --demo-compose /etc/dokploy/compose/woodright-stack-3dsdhd/code/docker-compose.staging.yml

ops/release/apply-memory-limits-resource-only.sh --mode execute --targets public_demo \
  --demo-compose /etc/dokploy/compose/woodright-stack-3dsdhd/code/docker-compose.staging.yml \
  --confirm-mutation I_UNDERSTAND_MEMORY_LIMITS_RESOURCE_ONLY

ops/release/apply-memory-limits-resource-only.sh --mode execute --targets production \
  --production-compose /etc/dokploy/compose/woodright-production/code/docker-compose.yml \
  --confirm-mutation I_UNDERSTAND_MEMORY_LIMITS_RESOURCE_ONLY
```

## Why not production cutover for limits-only

`cutover-production-candidate.sh` always writes ownership/EXPECTED state. Limits-only work must use the resource-only path (or a future dedicated helper) so ACTIVE/EXPECTED stay unchanged.

## Deferred (not Wave 1)

- PostgreSQL / Redis - separate budget proof (`POSTGRES_LIMIT_DEFERRED_*` / Redis maxmemory policy)
- Dokploy / Traefik - Swarm/platform maintenance (`DOKPLOY_PLATFORM_LIMITS_DEFERRED`)

## Capacity note (~8 GiB)

Dual-stack Wave 1 reservations (~1664 MiB) leave ≥1.5 GiB host reserve target. A temporary third application pair is **not** safe as a steady-state neighbour on this VM.
