# Production helper install provenance (Woodright)

## Problem

After the 2026-08-03 `adopt-live-candidates` recovery, production-scoped
`ACTIVE/OWNER/EXPECTED` recorded:

`helper_install_sha=6db00287e6c50a9dfe4e818993dde607992082c9`

even though the recovery helper binary and the governance install marker were:

`c30ed38d185209ee25141b284705a34e7c5dea92`

Root cause: helpers read the legacy file
`/srv/woodright/INSTALLED_PRODUCTION_CUTOVER_HELPER_SHA.txt` as authority, while
`install-environment-governance.sh` only updated
`/srv/woodright/tools/release/INSTALLED_ENV_GOVERNANCE_SHA.txt`. Bundle verify
did not compare the legacy mirror, so drift survived.

Original recovery evidence remains immutable:

`/srv/woodright/reports/production/pin-runtime-skew-recovery-20260803T080330Z`

## Canonical authority

**Canonical install SHA marker:**

`/srv/woodright/tools/release/INSTALLED_ENV_GOVERNANCE_SHA.txt`

Resolver: `ops/lib/woodright-install-provenance.sh` →
`wr_resolve_installed_governance_sha`.

Helpers must not invent the SHA from cwd/git/mtime. Missing/invalid canonical
marker fail-closes.

## Legacy compatibility mirrors (not authorities)

Installer atomically writes the **same** SHA to:

- `/srv/woodright/INSTALLED_PRODUCTION_CUTOVER_HELPER_SHA.txt`
- `/srv/woodright/INSTALLED_ENV_GOVERNANCE_SHA.txt` (root copy)

Verifier requires legacy mirrors == canonical. Divergent mirrors refuse
mutating operations. Dry-run reports drift.

## Provenance fields

| Field | Meaning |
| --- | --- |
| `application_source_sha` | OCI revision of live images |
| `operation_helper_install_sha` | Governance/helper SHA that performed the operation |
| `helper_install_sha` | Backward-compatible alias of `operation_helper_install_sha` |
| `metadata_correction_helper_sha` | SHA of the helper that corrected metadata (if any) |

Never substitute application SHA for helper SHA, or vice versa.

## Metadata-only correction

Entrypoint:

`ops/release/reconcile-production-candidate-metadata.sh`

Confirm token (execute only):

`I_UNDERSTAND_PRODUCTION_METADATA_PROVENANCE_CORRECTION`

Dry-run by default. Execute changes **only** production-scoped ownership JSON.
No pin writes, no compose recreate, no DNS/TLS/routes, no DB.

Creates a new evidence directory under
`/srv/woodright/reports/production/metadata-provenance-correction-<UTC>/`
and never rewrites the original recovery evidence.

## Stale residual proof (20260803 adopt-live)

When original evidence `json/helper-install-sha.txt` still holds the stale legacy
marker value `6db00287e6c50a9dfe4e818993dde607992082c9`, the correction helper
requires:

- `--operation-helper-sha c30ed38d185209ee25141b284705a34e7c5dea92`
- `--operation-helper-checksum 0a9a48a87618ecaaf48c52be452dce885ed9f7e99a2d1ef21ef01a22c11bb1f9`

(the recovery helper script sha256 at execute time). Original evidence directories
remain immutable.
