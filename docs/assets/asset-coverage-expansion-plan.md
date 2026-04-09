# Asset Coverage Expansion Plan

Расширение processed asset layer на Country-London-Paris + legacy fallback для Oliver/Provence.

---

## Current Coverage (Before This Task)

| Collection | In Subset | Processed | Coverage | Gaps |
|-----------|----------|-----------|----------|------|
| Oliver | 67 | 64 | 96% | 3 items (legacy only) |
| Provence | 29 | 25 | 86% | 4 items (legacy only) |
| Country-London-Paris | 13 | 0 | 0% | All 13 unprocessed |
| Monchelsea | 32 | 0 | 0% | Not in scope |

---

## Scope of This Task

### 1. Country-London-Paris Disk Assets

89 files in download manifest covering all 13 CLP products in the production subset.

| Product | Files | Main | Gallery | Color | Source folder |
|---------|-------|------|---------|-------|--------------|
| CO-02-1 | 9 | 1 | 0 | 8 | country / Стулья |
| CO-05-1 | 8 | 1 | 0 | 7 | country / Стулья |
| CO-08-1 | 8 | 0 | 8 | 0 | country |
| CO-14-2 | 2 | 0 | 2 | 0 | country |
| CO-15-2 | 6 | 1 | 1 | 4 | country |
| CO-61-1 | 9 | 0 | 2 | 7 | country / Стулья |
| CO-62-1 | 10 | 1 | 4 | 5 | country / Стулья |
| CO-62-2 | 4 | 0 | 4 | 0 | country |
| CO-62-3 | 2 | 0 | 2 | 0 | country |
| CO-65-1 | 10 | 0 | 3 | 7 | country / Стулья |
| CO-65-2 | 8 | 0 | 1 | 7 | country / Стулья |
| CO-66-1 | 8 | 0 | 1 | 7 | country / Стулья |
| CO-69-1 | 5 | 0 | 5 | 0 | country |

### 2. Oliver Legacy Fallback (3 items)

| Code | Name | Legacy URL |
|------|------|-----------|
| OL-00-1 | Шкаф угловой | `woodright.ru/images/detailed/11/ol-04-1-i1.jpg` |
| OL-05-Н | Комод высокий | `woodright.ru/images/detailed/8/ol-05-3-i1.jpg` |
| OL-08-2 | Тумбочка с дверкой | `woodright.ru/images/detailed/8/ol-08-1-i1.jpg` |

### 3. Provence Legacy Fallback (4 items)

| Code | Name | Legacy URL |
|------|------|-----------|
| PV-14-1 | Кровать 1-сп. без изножья | `woodright.ru/.../Screenshot_101_j3q4-5k.png` |
| PV-16-1 | Кровать 1,5-сп. без изножья | `woodright.ru/.../pv-15-1-i1.jpg` |
| PV-17-1 | Кровать 2-сп. без изножья | `woodright.ru/.../pv-18-1-i1.jpg` |
| PV-68-1 | Этажерка малая | `woodright.ru/.../Screenshot_45.png` |

---

## Source Priority

| Priority | Source | Conditions |
|----------|--------|-----------|
| 1 | Disk white-bg verified | Always preferred when available |
| 2 | Verified legacy main image | When no disk source exists |
| 3 | Legacy gallery / interior fallback | Last resort for gap-filling |
| 4 | Temporary PDF fallback | Not used in this task |

**Rule:** Legacy fallback never replaces a disk-derived processed asset.

---

## Expected Outcome

| Collection | Before | After | Delta |
|-----------|--------|-------|-------|
| Oliver | 64/67 | 67/67 | +3 (legacy) |
| Provence | 25/29 | 29/29 | +4 (legacy) |
| Country-London-Paris | 0/13 | 13/13 | +13 (disk) |
| **Total** | **89/109** | **109/109** | **+20** |
