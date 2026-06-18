# Legacy sources re-sort — remediation

| Finding | Action |
|---------|--------|
| P1 missing business gate LS key | Added to `LEGACY_STORAGE_SOURCES` with `importMode: deprecated` |
| P2 flat registry | Extended `LegacyStorageSource` type + metadata fields |
| P2 detect unsorted | `detectLegacyBoardStorage()` sorts by `importOrder` |
| Plan §3 outdated | Replaced with importOrder table + exclusions |
| Code | `legacySourcesForImport()` helper for Phase 6 |

**Files:** `media-ops-migration.ts`, `docs/operator/media-ops-implementation-plan.md`
