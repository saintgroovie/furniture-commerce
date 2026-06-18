# Phase 2 Task 2.1 — remediation

| Finding | Action |
|---------|--------|
| P2 bulk `saved_at` on every save | Added `patchInboxOrphanRow()` in `media-ops-session.ts`; only changed row gets new timestamp |
| P2 stale `items` closure | `setDecision` / `setNotes` use functional `setItems` |
| P3 neutral persistence module | Deferred — documented in review; dual-write via legacy import OK for Phase 2 |

**Re-smoke:** `node tmp/media-ops-phase2-task21-smoke.mjs` — 4/4 pass
