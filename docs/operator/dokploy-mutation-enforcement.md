# Dokploy mutation enforcement

## Problem

The global flock at `/srv/woodright/locks/live-cutover.lock` does not automatically cover Dokploy UI/API redeploy. A decorative wrapper that Dokploy can skip is **not** enforcement (rule 68).

## Selected strategy (this cycle)

**Dokploy sole-owner** with residual UI risk declared:

| Control | State |
|---|---|
| sole owner | `Dokploy` (machine-readable in ACTIVE_OWNER / policy JSON) |
| manual docker mutation | forbidden for routine path |
| global lock | still required for scripted/operator tooling |
| mutation lease | single-use; does not replace CAS |
| Dokploy UI residual | may remain; `claim_bypass_closed=false` until UI path is disabled |

## Status taxonomy

If residual UI bypass remains after governance merge:

`done_governance_merged_no_deploy_with_known_dokploy_bypass`

Do **not** claim full bypass closure.

## Validators

- `scripts/release/validate-dokploy-enforcement.cjs`
- `scripts/release/validate-mutation-lease.cjs`

## Forbidden in governance-only cycles

- redeploy / restart / image or port changes via Dokploy
- claiming wrapper closed the bypass while UI still mutates live
