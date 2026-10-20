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

## Compare-and-swap

A writer that replaces an existing approval must pass
`--expected-previous-approval-checksum` equal to the current file sha256.
The first approval in an empty slot must pass the sentinel `ABSENT`.
Omitting the checksum is not permission to overwrite. A stale checksum
returns `OWNER_APPROVAL_CAS_MISMATCH`.

New documents set `reservation_state` to `reserved` and
`approval_generation` to `apr1-` plus 32 hex characters. The file checksum
remains the compare token. `mtime` is not an identity.

While `reservation_state` is `reserved` (or the alias `in_flight`), a normal
`--operation approve` cannot replace a different candidate. The same candidate
with the current checksum is `OWNER_APPROVAL_UNCHANGED`. Replacing a reserved
approval requires `--operation cancel` or `--operation supersede`, each with
the current checksum. Cancel does not touch containers, pins, or the database.
A backup JSON is audit evidence. Copying it back onto the live path is not a
release control.

After a successful cutover Gate C, a reserved approval is marked `committed`.
The Gate A, Gate B, and Gate C checksums of that execute stay equal. The
committed file has a new checksum, which is the CAS token for the next
approval. A proven rollback marks the same approval `rolled_back` and also
mints a new checksum. An incomplete rollback stays `reserved`. A crash that
leaves `reserved` does not expire by time. The operator proves the cutover
lock is free and runs cancel.

Execute of `cutover-public-production-pair.sh` outside an isolated test harness
requires `--expected-approval-checksum` from the final dry-run. Setting
`WOODRIGHT_CUTOVER_HARNESS=1` does not waive that checksum when the meta root,
lock, compose env, or compose file is the canonical production path. The
effective compose env is `WOODRIGHT_CUTOVER_COMPOSE_ENV` when that override
is set. Dot segments and an existing symlink are normalized before the check.
Parent segments are applied only after the symlink they follow is resolved. A mismatch dies before the mutation lock
and before any pin write. The staged approval document is a private file.
The copy under the evidence directory is audit-only and is not installed.

Legacy files omit `reservation_state` and load as `legacy`. They still
authorize a cutover. Replacing them still requires the explicit checksum.
The first canonical rewrite upgrades them to `reserved`.

## Component observability

`COMPONENT_RELEASE_IDENTITY_OBSERVABILITY`

A storefront-only cutover still does not rewrite the shared
`WOODRIGHT_RELEASE_SHA` pin. That header stays the application baseline.
The running storefront image reports `x-woodright-storefront-source-sha`
from `WOODRIGHT_STOREFRONT_SOURCE_SHA` baked at image build. The running
backend image reports `x-woodright-backend-source-sha` the same way.
Those values may differ. That is expected after a component-only release,
not automatic drift. Approval files are not the place for this. See
`docs/operator/runtime-identity.md`.

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
