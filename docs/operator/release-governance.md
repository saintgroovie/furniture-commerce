# Release governance (Woodright)

## Lifecycle

1. Clean worktree on exact Git SHA (no dirty WIP).
2. Scoped PR → CI (fidelity + governance gates).
3. Merge to `main` → **does not** auto-cutover staging/demo.
4. Manual `workflow_dispatch` **Build staging images** → capture **immutable digests**.
5. Dokploy + `manual_flock_deploy` cutover only with `image@sha256:…`.
6. Public hydrated DOM verification + ≥5 race samples.
7. Update `ACTIVE_OWNER.json` / `ACTIVE-RUNTIME-OWNER.txt` together.

## Candidate / canonical / public

| Layer | Example | Meaning |
|---|---|---|
| Candidate | `:3032`→`:9032` | Temporary proof; not buyer truth |
| Canonical local | `:3002`→`:9000` | Owner QA stack |
| Public | `https://woodright-demo.ru` | Buyer-facing |

Never claim public success from candidate/API alone.

## Exact digest rule

Pin `ghcr.io/…/woodright-{backend,storefront}@sha256:…`.

Mutable tags (including full-SHA tags) can drift when another workflow rebuilds the same tag. **Tag drift is a deploy blocker** for tag-based restart.

## SHA parity

Backend and storefront OCI `org.opencontainers.image.revision` must equal the same 40-char Git SHA.

## Provenance chain

`source → commit → branch → workflow run → digests → containers → public DOM`

Schema: `schemas/woodright-release-manifest.schema.json`  
Validator: `node scripts/release/validate-release-manifest.cjs`

## Status taxonomy

See `.cursor/rules/woodright-release-runtime-governance.mdc`. Bare `done` is forbidden.

## Evidence

Keep screenshots/logs/inspect JSON under `/tmp` or a task directory — not in product commits.
