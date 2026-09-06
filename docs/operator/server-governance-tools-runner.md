# Server governance tools runner

Host may have **no Node on PATH**. Governance validators must still run reproducibly.

## Canonical wrapper

`scripts/release/run-server-governance-tool.sh`

Default image (exact digest):

`docker.io/library/node@sha256:6c74791e557ce11fc957704f6d4fe134a7bc8d6f5ca4403205b2966bd488f6b3`

Override only with another `image@sha256:…` via `WOODRIGHT_GOVERNANCE_TOOLS_IMAGE`.

## Security flags

- `--read-only`
- `--cap-drop ALL`
- `--security-opt no-new-privileges`
- `--user 1000:1000`
- `--network none` by default
- no Docker socket
- no privileged
- read-only mounts for tools/schemas/runtime/releases/audit

## Policy gate

`scripts/release/validate-tools-runner-policy.cjs` (Gate AK)

## Example

```sh
export WOODRIGHT_TOOLS_ROOT=/srv/woodright/tools
export WOODRIGHT_SCHEMAS_ROOT=/srv/woodright/schemas
./scripts/release/run-server-governance-tool.sh validate-active-release-bundle.cjs /runtime/ACTIVE_RELEASE.json
```

Do not run live mutation tools through this generic runner without a separate explicit permission.
