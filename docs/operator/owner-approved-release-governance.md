# Owner-approved release governance

Canonical SoT for **which** exact application SHA + digests may be promoted to
`public_demo` (and later `public_production`):

`/srv/woodright/meta/<environment>/OWNER_APPROVED_RELEASE.json`

This file is **not** running state. `ACTIVE_OWNER.json`, `EXPECTED_RELEASE`,
container labels, and confirm tokens do **not** authorize a promotion by themselves.

## Invariant

For ordinary promotion / pair cutover / component recreate / pin reconcile:

`requested SHA + digests == owner-approved SHA + digests` (exact full values).

Prefix matching is forbidden.

## Freeze override vs authorization

`WOODRIGHT_VALIDATION_FREEZE_OVERRIDE=1` only bypasses the **validation freeze timer**.
It does **not** authorize any SHA. Owner-approval Gate A/B/C remain mandatory.

Root / `euid=0` callers obey the same gates. There is no
`WOODRIGHT_DISABLE_OWNER_APPROVAL` escape (explicitly denied).

## Gates

| Gate | When | Checks |
|------|------|--------|
| A | Before image pull / require-local-image / pin staging | path safety, schema, exact identity |
| B | Under canonical mutation lock | re-check + checksum TOCTOU vs Gate A |
| C | Before authority/pin commit | live target still matches approval |

## Emergency rollback

Separate contract (`WOODRIGHT_OWNER_EMERGENCY_ROLLBACK=1` + reason + exact
pre-cutover emergency manifest). Cannot deploy an arbitrary retired SHA.

## Write helper

```sh
bash ops/release/reconcile-owner-approved-release.sh \
  --environment public_demo \
  --application-sha <40hex> \
  --backend-digest sha256:<64hex> \
  --storefront-digest sha256:<64hex> \
  --owner-authorization-id <id> \
  --evidence-reference <evidence-root> \
  --evidence-dir /abs/path \
  --previous-approved-sha <optional> \
  --apply \
  --confirm-mutation I_UNDERSTAND_OWNER_APPROVAL_WRITE
```

Dry-run is the default (omit `--apply`).

## Public production

Approvals are environment-scoped. A `public_demo` approval never authorizes
`public_production`. Production approval requires its own OWNER PASS + readiness evidence.

## Fidelity

```sh
bash scripts/ops/test-owner-approved-release-fidelity.sh
```

## Incident class (2026-08)

Stale deploy packet targeting retired `8f9b914…` with an old confirm token and
expired freeze, run as root, redeployed after OWNER PASS on `e485230…`.
Owner-approval gate closes that class fail-closed with audit trail.
