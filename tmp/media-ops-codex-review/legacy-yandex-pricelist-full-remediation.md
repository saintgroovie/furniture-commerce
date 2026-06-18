# Codex cross-audit — full remediation log (2026-06-18)

## P1

| Finding | Action | Status |
|---------|--------|--------|
| Audit pack missing | Copied from `furniture-commerce-emergency-fix` | done |
| Bootstrap 404 | Verified 200, 2548 items | done |
| P1 `isYandexUnmirrored` used `source_path` | Fixed: `local_cache_path` in types, bootstrap, gates | done |
| Cross-stats parser | `compute-cross-stats.cjs` | done (prior) |

## P2

| Finding | Action | Status |
|---------|--------|--------|
| Monchelsea alias | `qa/_lib/media-source-join.ts` + bootstrap SKU→handle | done |
| Oxford attribution | `scripts/build-oxford-photo-attribution.cjs` → `data/normalized/oxford-photo-attribution.json` (7 items) | done |
| WW matrix gate | `scripts/check-ww-matrix-gate.cjs` → `ww-matrix-gate-status.json`; UI via `collectionGate` | done |

## P3

| Finding | Action | Status |
|---------|--------|--------|
| SoT documentation | plan §3.1, `media-ops.md`, source hints banner | done |
| Operable scope | `OPERABLE_COLLECTIONS` in `media-source-gates.ts` | done |

## Phase 2 (plan)

| Task | Status |
|------|--------|
| 2.2 master-detail + tabs + URL `?tab=orphan&source_id=` | done |
| 2.3 Inbox → Assign navigation | done (`goAssign` + `canRouteToAssign`) |
| 2.4 orphan redirect | done (`source-media-orphan-review/page.tsx` → inbox) |

## Smoke

- `node tmp/media-ops-phase2-smoke.mjs` — 4/4
- `node tmp/media-ops-phase2-task21-smoke.mjs` — prior 4/4
