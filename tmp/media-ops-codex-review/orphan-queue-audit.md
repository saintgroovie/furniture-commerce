# Orphan Queue Audit

- Generated: 2026-06-18T21:01:28.682Z
- Verdict: **approve-with-notes**
- Queue rows audited: **2548**
- Estimated auto-routeable: **4 (0.16%)**
- Estimated manual or gated: **1618 (63.5%)**

## P0 Findings

- P0 rows: **527**
- P0 rows without sku_guess: **198**
- P0 cross-SKU risk rows: **0**
- P0 duplicate_can_merge rows: **15**

## P1 Findings

- Exact duplicate source_url groups: **0** (0 rows)
- Duplicate basename across source_kind groups: **0**
- Legacy-site vs Yandex overlap by basename: **0** groups
- Legacy-site vs Yandex overlap by sku_guess: **0** groups
- yandex_public queue rows without local_cache_path: **1915**

## P2 Findings

- Rows with sku_guess: **329 (12.91%)**
- Seed product_code match rate among sku rows: **4/329 (1.22%)**
- Legacy-media-inventory SKU match rate among sku rows: **108/329 (32.83%)**
- Workbook product_code match rate among sku rows: **5/329 (1.52%)**
- Handle guess mismatches after seed resolution: **0**
- MN/MNm/MNM alias rows: **0**, alias-resolved: **0**, unresolved: **0**

## P3 Findings

- P3 rows: **1812**
- P3 rows without sku_guess: **1812**
- orphan_noise bucket: **911**

## Triage Buckets

| Bucket | Rows | Percent |
| --- | ---: | ---: |
| needs_manual_mapping | 1432 | 56.2% |
| orphan_noise | 911 | 35.75% |
| blocked_by_collection_gate | 186 | 7.3% |
| duplicate_can_merge | 15 | 0.59% |
| auto_routeable | 4 | 0.16% |

## Top 10 Operator Actions

1. Route 4 auto_routeable rows first; all have seed handles, no cross-SKU risk, and are in CLP/Oliver/Provence.
2. Review 0 cross-SKU risk rows before any assignment; keep them out of automated routing.
3. Treat 15 rows with inventory basename evidence as duplicate_can_merge candidates.
4. Resolve 1432 needs_manual_mapping rows by SKU/article lookup before assignment.
5. Do not auto-map 186 Oxford/Monchelsea/Willie Winkie gated rows until collection-specific QA gates clear.
6. Ignore or defer 911 low-score P3 no-SKU rows unless a product owner requests broader recovery.
7. Backfill or re-download 1915 yandex_public queue rows without local_cache_path before visual review.
8. Use the 0 legacy/Yandex SKU overlap groups to merge review decisions across sources.
9. Investigate 0 unresolved MN/MNm/MNM alias rows; 0 MN-family rows already resolve via alias rules.
10. Sample the largest SKU clusters before bulk action; high cluster sizes often mix gallery, color, and possible cross-SKU filenames.

## Review Artifacts

- Full stats: `tmp/media-ops-codex-review/orphan-queue-audit-stats.json`
- Duplicate groups: `tmp/media-ops-codex-review/orphan-queue-duplicates.json`
- SKU mismatches and risk samples: `tmp/media-ops-codex-review/orphan-queue-sku-mismatches.json`
- Triage buckets: `tmp/media-ops-codex-review/orphan-queue-triage-buckets.json`
- Rerunnable script: `tmp/media-ops-codex-review/orphan-queue-audit.cjs`

## Code Fixes

No P1 storefront or audit-logic code fix was applied. The audit ran as a read-only analysis over the generated queue and normalized source indexes.
