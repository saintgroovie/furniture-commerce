# Release bundle manifest v2

A **release bundle** is an authorized compatible pair of components. It is **not** a single Git SHA.

## Why

Live may run split revisions (example):

- backend `643a429…`
- storefront `54d1802…`

Describing the pair as only `54d1802` is false. Use an immutable `bundle_id`:

`wrb-20260721T155624Z-be643a429-sf54d1802`

## Schema

- JSON Schema: `schemas/woodright-release-bundle-manifest.schema.json`
- Validator: `scripts/release/validate-release-bundle-manifest.cjs`
- ACTIVE_RELEASE pointer: `scripts/release/validate-active-release-bundle.cjs`

## ACTIVE_RELEASE v2 fields (minimum)

- `bundle_id`
- `backend_revision` / `backend_digest`
- `storefront_revision` / `storefront_digest`
- `manifest_path` (absolute server path to bundle `release-manifest.json`)
- `checksum_sha256` (SHA-256 of the **exact bytes** of the file at `manifest_path`)
- `activation_mode` (e.g. `reconciled_external_cutover`, `storefront_only_cutover`)

Validate on server:

```sh
./scripts/release/run-server-governance-tool.sh validate-active-release-bundle.cjs /runtime/ACTIVE_RELEASE.json
```

CI fixtures may wrap `{ active_release, manifest, checksum_sha256 }` for unit tests; production pointer is flat ACTIVE_RELEASE.json with `manifest_path`.

## Compatibility

Split pairs require:

- `compatibility_contract.status = compatible`
- evidence path
- buyer-visible public QA (`verification.public_passed`)

HTTP 200 alone is not enough.

## Metadata migration

v1 → v2 pointer update must prove container IDs and digests unchanged. It is **not** a deploy or cutover.

See rules 61–80 in `.cursor/rules/woodright-release-runtime-governance.mdc`.
