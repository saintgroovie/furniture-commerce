# Public demo pair cutover (digest)

## Purpose

Official, lock-safe tooling to cut over **public_demo** (`--environment staging`) to a verified backend + storefront **immutable digest pair**.

This replaces ad-hoc `docker create` during deploy. Ad-hoc recreate is forbidden because it risks Dokploy ownership drift, missing keepers, split release SHA, and irreversible partial cutovers.

## Scope

| In scope | Out of scope |
|----------|----------------|
| `woodright-staging-backend` | `woodright-production-*` |
| `woodright-staging-storefront` | `woodright.ru` / DNS / TLS |
| staging pin/identity files | production ownership dir / production lock |
| image-only cutover | automatic DB migration |

Profile: `ops/config/runtime-environments/staging.conf` (`runtime_role=public_demo`, DB `woodright_staging` / alias `public_demo_db`).

## Entry points

| Script | Role |
|--------|------|
| `ops/release/cutover-public-demo-pair.sh` | **Recommended** pair orchestrator |
| `ops/release/recreate-staging-storefront.sh` | Storefront leaf recreate |
| `ops/release/recreate-staging-backend-with-media.sh` | Backend leaf (media gate) |
| `ops/release/rollback-staging-*-from-keeper.sh` | Keeper rollback |
| `ops/release/public-demo-critical-http-smoke.sh` | Critical HTTP smoke (no browser) |

## Target / digest requirements

- Full 40-hex Git SHA
- Full `sha256:<64hex>` digests for **both** images
- No `latest`, branch tags, or mutable-sha-only pins
- OCI `org.opencontainers.image.revision` must equal target SHA when image is local

Example future deploy target (do **not** run from docs alone):

```text
SHA=8f9b914d219757ef0638aadd1c77f8ead253652a
BE=sha256:5c053fe4d6066c3f31aea13d29f1d53ef244dad92db2059d2f143486dcbdabcc
SF=sha256:079c02c4defd4d1adb8506037058b25abc1cca810902c0d77d182c6b0fb8585a
GH Actions run=30534468892
```

## Lock lifecycle

Canonical staging lock: `/srv/woodright/locks/live-cutover.lock`

- Pair orchestrator acquires flock and calls `wr_staging_mutation_lock_export_inherit` so leaf helpers nest without self-deadlock.
- Metadata `.meta` is **not** the mutex.
- Forged `WOODRIGHT_STAGING_MUTATION_LOCK_HELD=1` without owned FD/holder is rejected.

## Order (backend then storefront)

Storefront talks to backend via internal DNS `backend`. Backend-first keeps API available for SF boot/health. Pair verification requires **both** digests + matching public headers before SUCCESS.

## Backup gate

Execute mode calls official `/srv/woodright/ops/backup/woodright-backup-run.sh` and backs up pin/identity files into the evidence directory. Dry-run/preflight do **not** create backups.

## Keeper / rollback

Each service is stop → rename to keeper → create target → health.

On failure after mutation, pair orchestrator restores keepers (and pin backup when present).

Exit codes (pair):

| Code | Meaning |
|------|---------|
| 0 | success |
| 2 | usage / validation |
| 3 | lock busy |
| 10 | rollback completed after failure |
| 11 | rollback partial |
| 12 | rollback failed |
| 20 | reserved (unsafe dry-run) |
| 21 | verify-only failed |

Image-only cutover does **not** restore PostgreSQL.

## Pin handling

`reconcile-public-image-pins.sh` requires live containers to **already** match target digests. It is not a forward recreate.

**Pair cutover holds the canonical lock through:**

1. runtime recreate + health
2. pair identity verify + critical smoke
3. inherited-lock `APPLY=1` pin reconciliation (`.env` / `DOKPLOY_IMAGE_PINS.env` / `ACTIVE_PUBLIC.json`)
4. post-pin identity re-verify
5. only then `PAIR_CUTOVER_OK` and lock release

Pin APPLY failure triggers pair rollback (keepers + pin backup restore). `WOODRIGHT_SKIP_PIN_RECONCILE=1` cannot yield SUCCESS.

Standalone pin reconcile (outside pair) still acquires the lock itself. Nested under pair uses inherited flock FD / owned marker (forged env alone is rejected).

Evidence includes `planned-pin-reconcile.env` and `pin-apply-result.json`.

## Dokploy ownership

Recreate keeps `com.woodright.deployment-owner=Dokploy`, dual networks (`woodright_staging` + `dokploy-network`), and staging container names Traefik already targets. Do not invent a second compose controller.

## Modes

```bash
# Dry-run / preflight (no mutation)
ops/release/cutover-public-demo-pair.sh --environment staging --mode dry-run \
  --target-sha <40hex> \
  --backend-digest sha256:<64hex> \
  --storefront-digest sha256:<64hex> \
  --evidence-dir /tmp/wr-cutover-evidence-$$

# Verify-only (after a prior cutover)
ops/release/cutover-public-demo-pair.sh --environment staging --mode verify \
  --target-sha <40hex> \
  --backend-digest sha256:<64hex> \
  --storefront-digest sha256:<64hex> \
  --evidence-dir /tmp/wr-cutover-verify-$$

# Execute (separate deploy task; requires confirm token + env files mode 600)
ops/release/cutover-public-demo-pair.sh --environment staging --mode execute \
  --target-sha <40hex> \
  --backend-digest sha256:<64hex> \
  --storefront-digest sha256:<64hex> \
  --backend-env-file /path/be.env \
  --storefront-env-file /path/sf.env \
  --evidence-dir /var/tmp/wr-cutover-evidence-<ts> \
  --confirm-mutation I_UNDERSTAND_PUBLIC_DEMO_CUTOVER
```

Evidence root must be absolute and outside the Git worktree. Env values are never logged; inspect dumps redact `Env`.

## No migration

Default refuse when `WOODRIGHT_PENDING_MIGRATION=1`. Target `8f9b914` is image-only vs current demo.

## Production exclusion

Fail-closed on production container names, `--environment production` for these helpers, and forbidden domains from the staging profile. Production candidate uses a **different** lock and ownership directory.

## Emergency rollback

If pair auto-rollback fails: under flock, rename keepers back to live names using `rollback-staging-*-from-keeper.sh`, confirm public headers show the previous SHA, then run critical HTTP smoke.

## Fidelity

```bash
bash scripts/ops/test-public-demo-pair-cutover-fidelity.sh
```

## Known notes

- Pin APPLY runs under the same canonical lock via inherited flock (not a post-release manual step).
- Full browser smoke (burger/filters/React #310) stays in the deploy task, not in shell helpers.
- Standalone `reconcile-public-image-pins.sh` without pair remains valid for pin-only repair when live already matches.
