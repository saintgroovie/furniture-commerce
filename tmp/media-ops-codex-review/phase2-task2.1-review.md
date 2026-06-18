# Phase 2 Task 2.1 — Codex review

**Date:** 2026-06-17  
**Scope:** inbox-orphan extract + media-ops-session (orphan)  
**Verdict (initial):** request-changes → **approve-with-notes** (after remediation)

## P2 findings

1. **toPersistMap stamps all rows** — `useOrphanQueue.ts`  
   - Risk: merge «newer wins» broken for untouched rows  
   - Fix: `patchInboxOrphanRow()` — update single id, preserve other `saved_at`

2. **Stale closure on setDecision/setNotes** — `useOrphanQueue.ts`  
   - Fix: functional `setItems(prev => …)` + persist inside updater

## P3 (deferred)

- Shared neutral persistence module — defer to Phase 6 / cleanup (dual-write bridge acceptable for now)

## Acceptance

- Extract fetch/filter/persist/setDecision: yes  
- media-ops-session.inbox.orphan + dual-write legacy: yes  
- API routes unchanged: yes  
- 5 chips + primary «→ В Assign»: yes  
- P0 default filter: yes  
- No catalog writes: yes
