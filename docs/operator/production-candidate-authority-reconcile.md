# Production-candidate authority reconcile (private)

## Scope

Private `PRODUCTION_CANDIDATE` only. Not public launch. Not `public_demo`.

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
   pins are already correct, use:

```sh
ops/release/reconcile-production-candidate-metadata.sh \
  --environment production \
  --correction compose-common-release-sha \
  --application-source-sha <40hex> \
  --current-helper-install-sha <installed-ops-sha> \
  --storefront-ref ghcr.io/...@sha256:<64> \
  --backend-ref ghcr.io/...@sha256:<64> \
  --dry-run

# execute (separate authorization):
# --execute --confirm-mutation I_UNDERSTAND_PRODUCTION_METADATA_COMPOSE_RELEASE_SHA_CORRECTION
```

Gates (under production lock on execute): live RepoDigests, OCI revisions,
exact image pins, ownership `application_source_sha`, health. No container
recreate. Full compose `.env` byte backup + checksummed restore on failure.
Never prints env values.

## Installer concurrency

`install-environment-governance.sh` holds
`/srv/woodright/locks/env-governance-install.lock` and environment runtime
locks for the whole install. Concurrent installers fail closed. Canonical
marker is
`/srv/woodright/tools/release/INSTALLED_ENV_GOVERNANCE_SHA.txt`; legacy root
mirrors must match after install.

## Success matrix

`WOODRIGHT_RELEASE_SHA` == backend OCI == storefront OCI ==
`ACTIVE_OWNER.application_source_sha` == `EXPECTED_RELEASE.application_source_sha`
and production-candidate monitor `overall=ok` with the profile media volume.
