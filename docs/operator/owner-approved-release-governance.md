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

A file with no `component` field is a pair approval. It authorizes only
`--component pair`, where both image OCI revisions equal `application_sha`.

`--component storefront` requires an approval whose `component` is exactly
`storefront`. That file pins the new storefront digest to `application_sha`
and pins the retained backend by `backend_digest` plus `retained_backend_revision`.
`expected_current_storefront_digest` and `expected_current_backend_digest` are
the CAS of what is live before the cutover. A pair approval is not reused for
this. The shared `WOODRIGHT_RELEASE_SHA` pin is not rewritten, because the
backend revision did not move.

The canonical `public_production` approval file is sealed after write as
`root:woodright-ops` mode `0640`. Operators in `woodright-ops` can read it.
They cannot hand-edit it. Test checkouts that set `WOODRIGHT_META_ROOT` keep
the unprivileged write path.

## Storefront-only write

`--backend-digest` is the retained backend digest, not a rebuilt backend.
`--storefront-digest` is the new storefront. Also pass:

```sh
--component storefront \
--retained-backend-revision <40hex of the live backend> \
--expected-current-storefront-digest sha256:<live storefront> \
--expected-current-backend-digest sha256:<same as --backend-digest>
```

Live match for this component checks those retained identities. It does not
require the new storefront SHA to already be running.

## Fidelity

```sh
bash scripts/ops/test-owner-approved-release-fidelity.sh
```

## Incident class (2026-08)

Stale deploy packet targeting retired `8f9b914…` with an old confirm token and
expired freeze, run as root, redeployed after OWNER PASS on `e485230…`.
Owner-approval gate closes that class fail-closed with audit trail.
