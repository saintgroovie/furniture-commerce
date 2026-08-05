# Runtime ownership

## Active controller

Staging/demo buyer runtime is owned by **Dokploy + `manual_flock_deploy`**.

Disabled competitors (do not re-enable casually):

- HTTPS Nightly storefront replace
- Cursor Nightly HTTPS agent
- ad-hoc `wr-restore-https-task`

Host publish of `3000` / `3002` / `9000` on the VM is forbidden for competing stacks.

## Public-demo canonical authority (mutating)

For `public_demo`, mutating decisions (cutover / recreate / rollback / pin authority / monitor expected digests) use:

1. Immutable image refs (`ghcr.io/...@sha256:…`)
2. OCI revisions (`org.opencontainers.image.revision`)
3. Compose pins (`WOODRIGHT_*_IMAGE`, `WOODRIGHT_RELEASE_SHA`)
4. Runtime container digests / StartedAt identity
5. Scoped `ACTIVE_PUBLIC.json` (`runtime-identity-public-demo/`)
6. `OWNER_APPROVED_RELEASE.json` (when gate requires owner approval)
7. Scoped `ACTIVE_OWNER.json`
8. Scoped `EXPECTED_RELEASE.json`
9. Environment registry (`ops/config/runtime-environments/public_demo.conf`)

### Legacy `ACTIVE_RELEASE.json` (compatibility only)

Path (VM):

`/srv/woodright/runtime-ownership-public-demo/ACTIVE_RELEASE.json`

This schema-v2 bundle pointer is **not** authority. It is not:

- a cutover target
- a rollback target
- a recreate target
- monitor authority
- a fallback when scoped OWNER/EXPECTED/ACTIVE_PUBLIC exist
- production authority

It may remain on the VM as a historical/compatibility artifact. **Live reconcile, sync, or delete is not required** for a valid public-demo runtime when scoped authority matches pins/runtime.

Profile keys `WOODRIGHT_ACTIVE_RELEASE_DEPRECATED=1`, `WOODRIGHT_ACTIVE_RELEASE_AUTHORITATIVE=0`, and `WOODRIGHT_ACTIVE_RELEASE_COMPATIBILITY_ONLY=1` mark the residual path.

`UPDATE_ACTIVE_RELEASE=1` on `reconcile-public-image-pins.sh` is a **dangerous compatibility-only opt-in**. It requires `--confirm-mutation I_UNDERSTAND_LEGACY_ACTIVE_RELEASE_IS_NON_AUTHORITATIVE`. Normal cutover/recreate leave `UPDATE_ACTIVE_RELEASE=0` and do **not** refresh the legacy mirror. Stale mirror ≠ runtime drift.

`scripts/release/restart-active-digest-only.sh` for `--environment public_demo` reads scoped OWNER/EXPECTED/ACTIVE_PUBLIC. Pointing it at the legacy public-demo `ACTIVE_RELEASE.json` requires `LEGACY_ACTIVE_RELEASE_OPT_IN=1` plus the same confirmation token, and still fails closed unless legacy SHA/digests equal current scoped authority. Confirmation does not bypass equality.

Eventual live-file removal needs a separate migration/deprecation task. Do not delete the live file casually from ops install/cutover.

## Owner files (shared / historical)

Machine-readable:

`/srv/woodright/runtime-ownership/ACTIVE_OWNER.json`

Human-readable summary (must agree):

`/srv/woodright/locks/ACTIVE-RUNTIME-OWNER.txt`

**Public runtime identity (preferred SoT for role/exposure/route):**

`/srv/woodright/runtime-identity/ACTIVE_PUBLIC.json` (or environment-scoped `runtime-identity-public-demo/ACTIVE_PUBLIC.json`)

See `docs/operator/runtime-identity.md`. Do not treat stale `ACTIVE_RELEASE.json` digests as ground truth when they disagree with Traefik + live containers.

Deploy lock:

`/srv/woodright/runtime-ownership/DEPLOY.lock` (flock)

Verifier:

```bash
node scripts/release/check-owner-state.cjs \
  --json /path/ACTIVE_OWNER.json \
  --txt /path/ACTIVE-RUNTIME-OWNER.txt
```

Disagreement **blocks** cutover.

## Single owner rule

Do not manage the same `woodright-staging-backend` / `woodright-staging-storefront` pair from Compose, systemd, cron, Nightly, LaunchAgent, and Dokploy at once.

See also: `docs/operator/candidate-runtime-lifecycle.md`.
