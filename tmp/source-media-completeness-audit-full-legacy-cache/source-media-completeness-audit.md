# Source media completeness audit (full legacy cache union)

**Сгенерировано:** 2026-05-27T00:19:18.056Z
**Supersedes:** `tmp/source-media-completeness-audit/` (stale 468 legacy URLs)
**Вердикт:** `review_required`

## Executive summary

Новый manifest: **5032** строк (**817** vs stale audit **4215**). Legacy: **1285** full-cache URLs (было **468**). **unclassified = 0**. Prior **58** safe candidates: **58** still `safe_candidate_for_review`; **0** additional safe beyond 58. CO-02-1 exact gaps **unchanged**.

## Old vs new totals

| Metric | Stale audit | Full-cache audit | Δ |
|--------|------------:|-----------------:|--:|
| Total discovered | 4215 | 5032 | 817 |
| Legacy URLs | 468 | 1285 | 817 |
| Yandex public | 3747 | 3747 | 0 |

## Classification buckets

| Bucket | Stale | Full-cache | Δ |
|--------|------:|-----------:|--:|
| approved_existing_or_known | 1492 | 1573 | 81 |
| safe_candidate_for_review | 58 | 58 | 0 |
| blocked_cross_sku | 20 | 20 | 0 |
| blocked_low_confidence | 2 | 2 | 0 |
| needs_manual_mapping | 32 | 330 | 298 |
| unmapped_orphan | 2012 | 2219 | 207 |
| duplicate_exact | 100 | 100 | 0 |
| duplicate_near | 333 | 564 | 231 |
| unsupported_asset | 166 | 166 | 0 |

## Safe candidate (58) delta

- Prior supplement safe list: **58**
- Still `safe_candidate_for_review` in full manifest: **58**
- New safe beyond prior 58: **0**
- Missing from full cache: **0**

## Orphan / manual + P0

- Orphan+manual total: **2549** (was **2044**)
- P0: **528** (was **236**, Δ **292**)

## Newly included legacy URLs (817)

- Count: **817**
- Product-media-like (SKU + image + safe/manual/approved): **373**
- Classification of new-only: {"unmapped_orphan":209,"approved_existing_or_known":81,"needs_manual_mapping":299,"duplicate_near":228}

## CO-02-1

- **CO-02-1_main**: still missing (exact)
- **CO-02-1_gallery_04**: still missing (exact)
- **CO-02-1_gallery_05**: still missing (exact)
- **co-02-1-i4**: still missing (exact)
- **co-02-1-i5**: still missing (exact)

## Next actions

1. Use **this** folder as superseding evidence; treat stale `source-media-completeness-audit` as historical.
2. Review `source-orphan-priority-queue.json` top 50 + legacy newly-included with SKU.
3. Visual review prior **58** safe candidates only via supplement pack — not auto-apply.
4. Optional: refresh `legacy-site-crawl.json` on disk to match full cache.