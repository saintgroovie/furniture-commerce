# Parked patches - do not apply as-is

Captured 2026-09-18 from leftover working trees vs `origin/main` `07a34c6`.

| File | Why parked |
|---|---|
| `C2-route-veil-vs-origin-main.patch` | Removes boot `stuck` timeout; stops polling while `.route-loading-fallback` exists; treats broken images as still pending. Can stick or delay the veil. |
| `C3-product-card-PARKED-vs-origin-main.patch` | Replaces `cardThumbnailSrcFromProduct` with inline thumb + `displayGroup` title. Possible catalog-card regression. Needs owner gate. |
| `C4-catalog-browse-slim-vs-origin-main.patch` | Strips `buyer_default_configuration` to two price fields. Promotion slot reuses this projection; `promotion-card.tsx` uses `material_execution_code` for the «от » prefix. |

Safe follow-ups (separate branches, after Codex):

- C2: keep failsafe timeout + fallback polling; only harden ATF decode wait.
- C4: keep `material_execution_code` (and any other browse consumers) or update promotion-card first; then slim marketing prose only.
