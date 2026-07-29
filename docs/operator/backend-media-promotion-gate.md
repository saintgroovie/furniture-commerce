# Backend media promotion gate (Woodright) — Media Gate V2

**Audience:** release operators / SRE  
**Scope:** staging `public_demo` backend only. Does not cut over production `woodright.ru`.

## Why (V1 chicken-and-egg)

After a legitimate backend digest advance, the live container already ran the **new** digest while `EXPECTED_RELEASE.json` still listed the **old** digest. The post-create media gate used discovery with `WOODRIGHT_REQUIRE_EXPECTED_DIGEST=1` against the still-old expected release → `DIGEST_MISMATCH` → `MEDIA_PROMOTION_GATE_FAILED`, even when `/server/static` was correctly mounted.

V2 splits validation so the gate can prove the **target** media contract **before** cutover and prove the **live** container **after** cutover **without** requiring manifests to already list the new digest.

## Hard rule

Do **not** declare a backend deployment successful and do **not** update `ACTIVE_OWNER.json` / `EXPECTED_RELEASE.json` until **all** are true (Mode B PASS):

1. Backend healthy  
2. Image digest matches **planned target** (pin or expected)  
3. `com.woodright.deployment-owner=Dokploy`  
4. Media mount present at `/server/static`  
5. Exact volume `woodright-stack-3dsdhd_woodright_staging_media`  
6. Mount is **RW**  
7. Volume not empty (min files/bytes; lower bound, not a fixed constant)  
8. Representative JPEG + WebP readable  
9. Buyer `/product-static` sample HTTP 200 (when `--buyer-host` is set)  
10. No host port publication  
11. Keeper/candidate names never treated as live  

Until Mode B PASS, `ACTIVE_OWNER` / `EXPECTED_RELEASE` stay on the **old stable** release (no premature identity). No `PENDING_RELEASE.json` is required: pass target digest via wrapper args + `WOODRIGHT_PINNED_*` + optional evidence file.

## Mode A — pre-promote (target)

Validates target image + media volume **before** live mutation. Does **not** require target running or listed in EXPECTED_RELEASE. Does **not** write manifests.

```sh
ops/release/verify-backend-media-mount.sh \
  --mode pre-promote \
  --target-image 'ghcr.io/<org>/woodright-backend@sha256:<64hex>' \
  --target-sha '<40hex>' \
  --expected-digest 'sha256:<64hex>' \
  --media-volume woodright-stack-3dsdhd_woodright_staging_media \
  --mount-destination /server/static
```

Checks: immutable digest ref; image inspectable; optional OCI revision match; volume exists; RO content probe (file lower bound + representatives); planned dest `/server/static`; compose declaration. Optional `--skip-volume-probe` only for local fixture paths that cannot reach Docker volumes.

## Mode B — post-promote (live)

Validates exact live backend. Pin target digest when EXPECTED_RELEASE is still old:

```sh
ops/release/verify-backend-media-mount.sh \
  --mode post-promote \
  --container woodright-staging-backend \
  --expected-digest 'sha256:<64hex>' \
  --target-sha '<40hex>' \
  --buyer-host https://woodright-demo.ru \
  --write-evidence /tmp/woodright-media-gate-evidence.json
```

Stable no-op (current digest already in EXPECTED_RELEASE) still works without `--expected-digest`.

## Promote / recreate path

`ops/release/recreate-staging-backend-with-media.sh`:

1. Mode A (before lock)  
2. Acquire `/srv/woodright/locks/live-cutover.lock`  
3. Mode A again under lock  
4. Stop → keeper → create with volume mount (no host ports)  
5. Wait healthy → Mode B with digest pin + evidence  
6. On Mode B fail: ERR recovery restores keeper under the same lock  

For **digest advance**, set `REQUIRE_CURRENT_DIGEST=0` (default `1` is for same-digest remount repair). Pass `TARGET_SHA` / `WOODRIGHT_TARGET_SHA` when OCI revision must match.

## Manifest reconcile

```sh
ops/release/assert-manifest-update-allowed.sh \
  --expected-src ./EXPECTED_RELEASE.candidate.json \
  --evidence /tmp/woodright-media-gate-evidence.json

ops/release/reconcile-runtime-manifests.sh --dry-run \
  --active-src ./ACTIVE_OWNER.candidate.json \
  --expected-src ./EXPECTED_RELEASE.candidate.json

ops/release/reconcile-runtime-manifests.sh --apply \
  --active-src ./ACTIVE_OWNER.candidate.json \
  --expected-src ./EXPECTED_RELEASE.candidate.json
```

`assert-manifest-update-allowed.sh` pins candidate `backend_digest` / `approved_git_sha` into Mode B so reconcile can run after a successful digest-advance recreate **before** manifests are rewritten. Optional evidence must be fresh (`MEDIA_GATE_PASS`, matching digest, age bound). Stale or mismatched evidence → fail-closed, no write.

## Compose-only / fixture

```sh
ops/release/verify-backend-media-mount.sh --compose-only
ops/release/verify-backend-media-mount.sh --fixture-dir /path/to/fixture
```

## Empty trap volume

Never use `woodright-staging_woodright_staging_media` (historically empty). Only the stack external volume name above.

## Related

- `docs/operator/runtime-identity-governance.md` (if present) / `docs/operator/runtime-identity-monitoring.md`
- `docs/operator/backup-policy.md`
- `docs/operator/dokploy-staging.md`
- `ops/lib/woodright-runtime-discovery.sh` (`WOODRIGHT_PINNED_BACKEND_DIGEST`)
- Fidelity: `scripts/ops/test-media-gate-v2-fidelity.sh`, `scripts/release/backend-media-promotion.fidelity.test.cjs`
