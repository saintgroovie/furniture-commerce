# Media Ops — Codex scoped review summary

**Date:** 2026-06-17  
**Scope:** plan + Phase 1 Tasks 1.1–1.3 (media-ops only)  
**Verdict:** request-changes

## Blockers before Phase 1 continuation

1. **Bridge lifecycle** — `useRegisterMediaOpsAssignBridge` depends on full `ctx`; risk of effect churn / loop.
2. **`do_not_auto_apply` contract** — UI promises it; v2 export JSON does not include it; plan conflicts with byte-identical parity.

## Top plan edits

1. Resolve §6 conflict: byte-identical v2 JSON **or** wrapper with `do_not_auto_apply` — not both without spec change.
2. Move session/migration banner earlier (before daily driver claim).
3. Add standalone v2 regression acceptance before redirects.
4. Add drawer a11y acceptance (Escape, focus, role=dialog).
5. Add export parity smoke (toolbar vs drawer).

## Top code edits

1. Fix bridge registration (stable setter / adapter outside v2).
2. Invert dependency: v2 should not import `media-ops/**`.
3. Implement or defer `highlight` deep link with explicit UX.
4. Add `do_not_auto_apply` to export per chosen contract.
5. Reduce duplicate status (shell vs embedded hint).

## Note on first Codex run

`codex review --uncommitted` reviewed entire dirty tree (backend, room-sets, etc.).  
Use this scoped summary + MCP review for Media Ops only.
