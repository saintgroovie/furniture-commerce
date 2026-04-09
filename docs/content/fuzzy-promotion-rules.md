# Fuzzy Match Promotion Rules

Строгие правила для безопасного повышения fuzzy matches до verified.

---

## Promotion Criteria (ALL must be true)

A fuzzy match can be promoted to `verified` only if **every** condition is met:

1. **Same collection** — workbook and legacy product are in the same collection
2. **Same product type** — product category matches (bed→bed, dresser→dresser)
3. **No competing candidates** — no other legacy product better matches this workbook item
4. **No VV ambiguity** — item is NOT in willie-winkie collection
5. **No cross-collection conflict** — the legacy image URL is not shared with another collection
6. **Evidence of identity** — at least one of:
   - Base product name is an exact match (ignoring collection suffix)
   - Article code prefix matches with only sub-collection marker difference (MNm→MN)
   - Transliteration match (Кристалл→Cristal)
   - Only difference is abbreviation style (подъем мех→подъемный механизм)

---

## Automatic Rejection Criteria (ANY triggers rejection)

A fuzzy match must **remain fuzzy or be rejected** if:

1. **Different door/drawer count** — `1-дв.` matched to `2-дв.`, `2 ящика` vs `1 ящик`
2. **Different size class** — 90×190 matched to 160×200 (adjacent sizes like 120 vs 140 are borderline)
3. **Material variant mismatch** — `с тканью` (upholstered) matched to plain wood version
4. **Different product subtype** — `буфетный` matched to `книжный`, `комод` to `столик туалетный`
5. **Modular vs standalone ambiguity** — `(модуль)` matched to non-modular item without confirmation
6. **Multiple workbook items match same legacy item** — creates 1:N ambiguity

---

## Size Variant Policy

Beds of the **same design** in the **same collection** but different sizes (e.g., 120×190 vs 140×190):

- **Promote as `verified_size_variant`** — the image is representative of the design
- Add `review_notes: "size_variant: WB={wb_size} LG={lg_size}"`
- Confidence: 0.75 (lower than exact match's 0.9)
- Only if the size difference is within one step: single↔semi-double, semi-double↔double
- **Do NOT** promote 90×190 to 180×200 (too large a jump)

### Size adjacency rules

| From | Can match to | Cannot match to |
|------|-------------|----------------|
| 90×190 | 120×190 | 140+, 160+, 180+ |
| 120×190 | 90×190, 140×190 | 160+, 180+ |
| 140×190 | 120×190 | 90×190, 160+, 180+ |
| 160×200 | 180×200 | 90×190, 120×190 |
| 180×200 | 160×200 | 90×190, 120×190 |

---

## Abbreviation Equivalences (safe to promote)

| Workbook | Legacy | Meaning |
|----------|--------|---------|
| `подъем мех` / `подъемн.мех-змом` | `подъемный механизм` | Lift mechanism |
| `СВАРОВСКИ` | `Swarovski` | Crystal brand |
| `Кристалл` | `Cristal` | Product model name |
| `руч.лев/пр` | (absent) | Handle left/right — config detail |
| `0П` / `0Я` | `ОЯ` / `ПО` | Drawer configuration (0=О typo) |
| `1-тумб.` | `1-тумбовый` | One pedestal |
| `2-тумб.` | `2-тумбовый` | Two pedestals |

---

## Promotion Output Format

Each promoted entry must include:

```json
{
  "workbook_row_key": "...",
  "mapping_status": "promoted",
  "confidence": 0.85,
  "promotion_reason": "exact_name_match | abbreviation_match | size_variant | transliteration",
  "promotion_evidence": "human-readable explanation",
  "original_match_basis": "name_in_collection | fuzzy_name",
  "original_confidence": 0.70
}
```

---

## What Cannot Be Promoted Without Human Review

1. Greenwich name-based matches where workbook has generic name ("Комод", "Консоль")
   and legacy has model-specific name ("Комод Scale", "Консоль Step")
2. Monchelsea modular wardrobes (1-дв vs 2-дв, various drawer configs)
3. Oliver beds with подъемный механизм matched to beds with изножье
4. Any match where drawer/panel configuration differs (ПП vs ЯП vs 0П etc.)
5. "с тканью" variants matched to non-fabric versions
