# Runtime identity monitoring

## Sources of truth

| File | Role |
|------|------|
| `/srv/woodright/runtime-ownership/ACTIVE_OWNER.json` | live ownership + approved digests |
| `/srv/woodright/runtime-ownership/EXPECTED_RELEASE.json` | optional explicit expected pair |

## Fields used by monitor

- `storefront_digest` / `sf_digest`
- `backend_digest` / `be_digest`
- `approved_git_sha` / `git_sha`
- `owner` / `runtime_owner` (expect Dokploy)

## Drift handling

- Digest mismatch → **warning** (not auto-rollback)
- Running `18fd465` controller image → **critical**
- Nightly lock / controller process → **critical**
- Stopped rollback keeper images may retain historical names; monitor checks **running** containers only for forbidden revision

## Update procedure

1. Owner-approved release / cutover completes (backend recreate must pass `ops/release/verify-backend-media-mount.sh`)
2. Operator runs `ops/release/reconcile-runtime-manifests.sh --apply` with candidate JSON (gate runs first; blocks on `Mounts=[]` / wrong volume / product-static fail)
3. Monitor only compares; confirm `media_mount=pass`

Never let backup/monitor scripts rewrite these files. Never bypass `reconcile-runtime-manifests.sh` for live owner/expected updates.
