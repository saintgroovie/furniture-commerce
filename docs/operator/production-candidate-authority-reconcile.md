# Production-candidate authority reconcile (private)

## Scope

Private `PRODUCTION_CANDIDATE` only. Not public launch. Not `public_demo`.

## Four distinct SHA / identity layers

Keep these separate. Do not substitute one for another.

| Layer | Meaning | Authority? |
|---|---|---|
| `application_source_sha` | Full 40-hex Git SHA of the application images (OCI `org.opencontainers.image.revision`) | Yes - cutover target / ownership manifests |
| `operation_helper_install_sha` | Ops commit that installed the cutover/recovery helper performing an operation | Provenance only |
| `current_governance_install_sha` | Canonical installed governance bundle marker (`INSTALLED_ENV_GOVERNANCE_SHA.txt`) | Install/verify only |
| `WOODRIGHT_RELEASE_SHA` | Compose env + runtime header `x-woodright-release-sha` | **No** - informational application identity visible in runtime |

`WOODRIGHT_RELEASE_SHA` means only the application identity exposed in the runtime header. It must **not** mean helper SHA, governance SHA, deployment lineage, Git branch, or current `origin/main`.

Deploy / rollback authority remains:

- immutable image digests (pins + runtime RepoDigests);
- OCI revision equality to `application_source_sha`;
- scoped ACTIVE / OWNER / EXPECTED manifests.

A stale compose/header marker is classified `production_release_sha_marker_stale_non_blocking`. It does not require a live emergency fix and does not block a valid future pair cutover dry-run.

## Residuals this tooling closes

1. **Monitor false-critical media_mount** - health check used a hardcoded
   staging volume substring. Production profile already defines
   `WOODRIGHT_MEDIA_VOLUME=woodright-production_woodright-production_media`.
   Monitor now requires exact `Type=volume` + `Name` + `Destination` from the
   loaded governed profile (fail-closed).

2. **Stale compose `WOODRIGHT_RELEASE_SHA`** - pair cutover wrote image pins and
   ownership manifests but left the common compose release key untouched.
   Cutover / skew-recovery now include `WOODRIGHT_RELEASE_SHA` in the same
   atomic compose `.env` transaction when both pins prove OCI revision equals
   the application `SOURCE_SHA`.

3. **Metadata-only path** - when containers, digests, OCI revisions, and image
   pins are already correct, use either preferred thin entrypoint or the
   shared metadata helper:

```sh
# Preferred thin entrypoint (default dry-run):
ops/release/reconcile-production-release-sha.sh \
  --environment production \
  --application-source-sha <40hex> \
  --current-helper-install-sha <installed-ops-sha> \
  --storefront-ref ghcr.io/...@sha256:<64> \
  --backend-ref ghcr.io/...@sha256:<64>

# Equivalent:
ops/release/reconcile-production-candidate-metadata.sh \
  --environment production \
  --correction compose-common-release-sha \
  --application-source-sha <40hex> \
  --current-helper-install-sha <installed-ops-sha> \
  --storefront-ref ghcr.io/...@sha256:<64> \
  --backend-ref ghcr.io/...@sha256:<64> \
  --dry-run

# execute (separate owner authorization - not part of normal cutover dry-run):
# --execute --confirm-mutation I_UNDERSTAND_PRODUCTION_METADATA_COMPOSE_RELEASE_SHA_CORRECTION
```

Gates (under production lock on execute): live RepoDigests, OCI revisions,
exact image pins, ownership `application_source_sha`, health, profile
role/exposure/DB alias, no public Traefik. No container recreate. Full compose
`.env` byte backup + checksummed restore on failure. Never prints env values.

Dry-run packet fields include:

- `metadata_only=true`
- `container_recreate_planned=false`
- `pin_image_write_planned=false`
- `release_sha_write_planned=true`
- `runtime_recreate_planned=false`

## Atomic pair pin contract

One governed compose `.env` snapshot writes together:

- `WOODRIGHT_STOREFRONT_IMAGE=<immutable ref>`
- `WOODRIGHT_BACKEND_IMAGE=<immutable ref>`
- `WOODRIGHT_RELEASE_SHA=<full application source SHA>`

Write of the release marker is allowed only when:

- source SHA is full 40 hex;
- storefront and backend OCI revisions both equal that SHA;
- both images carry `production_candidate` profile;
- immutable refs validate;
- production registry authority passes.

Forbidden: deriving the marker from helper install SHA or `origin/main`;
mutable tags; writing the marker after pin publication as a second step;
treating the marker as deploy/rollback authority.

Pin backup includes the previous `WOODRIGHT_RELEASE_SHA`. Rollback restores
old image refs and the old marker as one snapshot. If images restore but the
marker does not, terminal state is `rollback_incomplete` (exit 13) - never a
false `rolled_back`.

## Installer concurrency

`install-environment-governance.sh` holds
`/srv/woodright/locks/env-governance-install.lock` and environment runtime
locks for the whole install. Concurrent installers fail closed. Canonical
marker is
`/srv/woodright/tools/release/INSTALLED_ENV_GOVERNANCE_SHA.txt`; legacy root
mirrors must match after install.

## Header semantics

`x-woodright-release-sha` continues to reflect `WOODRIGHT_RELEASE_SHA`.

It is diagnostic only: not OCI authority, not a substitute for
`application_source_sha`, and may be stale on a legacy runtime until a
governed metadata reconcile or the next atomic pair cutover.

## Success matrix

`WOODRIGHT_RELEASE_SHA` == backend OCI == storefront OCI ==
`ACTIVE_OWNER.application_source_sha` == `EXPECTED_RELEASE.application_source_sha`
and production-candidate monitor `overall=ok` with the profile media volume.
