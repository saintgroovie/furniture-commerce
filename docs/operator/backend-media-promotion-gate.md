# Backend media promotion gate (Woodright)

**Audience:** release operators / SRE
**Scope:** staging `public_demo` backend only. Does not cut over production `woodright.ru`.

## Why

An a11y-p2 candidate promotion created `woodright-staging-backend` with `Mounts=[]` while the durable volume `woodright-stack-3dsdhd_woodright_staging_media` still held ~6835 files. Buyer HTML stayed up; `/product-static/*` returned 404.

Compose already declared the mount. Promotion tooling that recreates containers **outside** compose (flock/`docker create`) must not skip the volume.

## Hard rule

Do **not** declare a backend deployment successful and do **not** update `ACTIVE_OWNER.json` / `EXPECTED_RELEASE.json` until **all** are true:

1. Backend healthy
2. Image digest matches intended release
3. `com.woodright.deployment-owner=Dokploy`
4. Media mount present at `/server/static`
5. Exact volume `woodright-stack-3dsdhd_woodright_staging_media`
6. Mount is **RW**
7. Volume not empty (min files/bytes)
8. Representative JPEG + WebP readable
9. Buyer `/product-static` sample HTTP 200 (when `--buyer-host` is set)
10. No host port publication (`HostConfig.PortBindings` empty; no HostPort mappings)
11. `media_mount` contract pass (same conditions monitoring uses for `media_mount=pass`)

Manifest update is **owner-controlled** and happens **only after** gate PASS via `ops/release/reconcile-runtime-manifests.sh`. Never auto-reconcile expected digests from a broken live container.

## Gate command (read-only)

```sh
# Compose declaration only
ops/release/verify-backend-media-mount.sh --compose-only

# Live candidate / public backend (uses discovery or --container)
ops/release/verify-backend-media-mount.sh --buyer-host https://woodright-demo.ru

# Explicit container
WOODRIGHT_BE_CONTAINER=woodright-staging-backend \
  ops/release/verify-backend-media-mount.sh --buyer-host https://woodright-demo.ru
```

Non-zero exit ⇒ **promotion forbidden**. The gate never remounts, never rebuilds, never writes manifests.

## Promote / recreate path (enforced)

`ops/release/recreate-staging-backend-with-media.sh` always mounts the durable volume and, after healthy, runs `verify-backend-media-mount.sh`. Gate failure triggers ERR recovery (keeper restore) and refuses success.

## Manifest reconcile (enforced)

```sh
ops/release/assert-manifest-update-allowed.sh

ops/release/reconcile-runtime-manifests.sh --dry-run \
  --active-src ./ACTIVE_OWNER.candidate.json \
  --expected-src ./EXPECTED_RELEASE.candidate.json

ops/release/reconcile-runtime-manifests.sh --apply \
  --active-src ./ACTIVE_OWNER.candidate.json \
  --expected-src ./EXPECTED_RELEASE.candidate.json
```

`reconcile-runtime-manifests.sh` calls `assert-manifest-update-allowed.sh` (compose + live gate) before any write. Do not hand-edit live manifests around the gate.

After apply, run monitoring once and confirm `media_mount=pass` / `overall=ok` (read-only confirm; not a substitute for the gate).

## Backup discovery

Backup/monitor no longer default to ephemeral Compose names (`woodright-stack-3dsdhd-backend-1`). Resolution order:

1. Explicit `WOODRIGHT_BE_CONTAINER` / `WOODRIGHT_SF_CONTAINER`
2. `ACTIVE_OWNER.json` `be_container` / `sf_container`
3. Unique running `public_demo` + `Dokploy` + image title match
4. Fail-closed on zero/multiple matches, digest mismatch, missing media, keepers/candidates

Shared helper: `ops/lib/woodright-runtime-discovery.sh`

## Empty trap volume

Never use `woodright-staging_woodright_staging_media` (historically empty). Only the stack external volume name above.

## Related

- `docs/operator/backup-policy.md`
- `docs/operator/dokploy-staging.md`
- `/srv/woodright/runtime-ownership/BACKEND_MEDIA_MOUNT_CONTRACT.json` (VM)
- `ops/release/verify-backend-network-alias.cjs` (DNS alias; complementary)
