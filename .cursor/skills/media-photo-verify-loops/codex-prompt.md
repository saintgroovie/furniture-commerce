# Codex prompt - media gallery verify

Copy into MCP `user-codex-woodright-reviewer` / tool `codex` (`sandbox: read-only`, `approval-policy: never`).

Replace bracketed sections with real paths/snippets from the latest run.

```text
Woodright independent review (read-only): media gallery verify LOOPs.

## Goal
Confirm the agent’s photo was→became audit is sound: no lost protected angles, no remaining evidence dups, controls hold, live smoke honest.

## Inputs (read these)
- docs/storefront/MEDIA_GALLERY_VERIFY_PIPELINE.md
- docs/storefront/media-gallery-verify-latest.md
- apps/storefront/tmp/media-gallery-verify.json
- Optional baseline: apps/storefront/tmp/media-gallery-baseline.json
- Runtime evidence: apps/storefront/src/lib/data/media-near-dup-collapse.json
- Scripts: apps/storefront/scripts/verify-product-media-gallery.ts
            apps/storefront/scripts/analyze-product-media-near-dups.ts
- Consume path: apps/storefront/src/lib/pdp-buyer-gallery-core.ts
                apps/storefront/src/app/product/[id]/page.tsx (shared restore→drop→normalize)

## Controls
- av-05-1: keep both iso angles (do_not_collapse / restore after buyer front_3_4 slot)
- ol-84-1: drop gallery_01 near-dup of i2 (evidence collapse)

## Latest run summary
[paste counts: products, P1, P2, control effective basenames, live flags]

## Ask
1) Any P1/P2 the verify script missed (false negatives)?
2) Any over-flagging (false positives) that would block good galleries?
3) Is shared PDP boundary (restore → evidence drop → resolvePdpMediaBundle) still correct?
4) Codex commit gate: safe_to_commit | needs_fixes | unsafe_scope
5) Codex reviewer status: approve | approve-with-notes | request-changes

Do not edit files. Concise findings + gate only.
```
