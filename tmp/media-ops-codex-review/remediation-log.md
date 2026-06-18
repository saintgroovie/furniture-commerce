# Codex review — remediation log (2026-06-17)

## Applied

| Codex finding | Fix |
|---------------|-----|
| P1 bridge lifecycle | `useCallback` stable `setBridge`; hook depends on `setBridge` only |
| P1 do_not_auto_apply vs parity | `MediaOpsAssignmentExportPayload` wrapper; `assignment` subtree byte-identical v2 |
| P2 v2 → media-ops imports | Removed; `V2ShellBridgeSnapshot` + `assign/media-ops-v2-bridge-adapter.ts` |
| P2 highlight not implemented | `data-v2-pool-inventory-id` + scroll/pulse effect |
| P2 drawer a11y | `role=dialog`, `aria-modal`, Escape, initial focus |
| P2 duplicate status | Embedded ExportToolbar hidden; blocked reason only in drawer |
| P3 shell loading | `⏳ Загрузка Assign…` until bridge registers |
| P3 session timing | `media-ops-migration.ts` detect + banner (import Phase 6) |
| Task 1.4 redirect | `legacy-media-assignment-board-v2/page.tsx` → media-ops assign |
| Plan §6 | Wrapper contract documented |
| Smoke | `tmp/media-ops-phase1-smoke.mjs` — 3/3 pass |
| Operator doc | `docs/operator/media-ops.md` |

## Verdict after remediation

approve-with-notes — Phase 2+ still pending (Inbox, full migration import).
