# Greenwich Display Parity Model

Defines how Greenwich products should render on catalog card and PDP, using structured display hierarchy driven by backend metadata.

---

## Principles

1. **Backend-driven** — all display fields come from Medusa product data or metadata
2. **Structured hierarchy** — collection, name, article, dimensions are separate visual layers, not concatenated into mega-titles
3. **Graceful fallback** — if a field is missing, the layout degrades cleanly (no empty labels, no broken rendering)
4. **Not Greenwich-specific** — same rendering logic applies to any collection that provides metadata

---

## Regular Product Card

```
┌────────────────────────────────┐
│         [product image]        │
├────────────────────────────────┤
│ Greenwich · GR-05-1            │  ← collection label + article (small, muted)
│ Комод                          │  ← h3, canonical product name
│ 1244 × 512 × 630              │  ← dimensions W×D×H (small, muted)
│ 109 500 ₽                     │  ← price
└────────────────────────────────┘
```

### Field sources
| Visual element | Source | Fallback |
|----------------|--------|----------|
| Collection label | `metadata.collection_label` | not shown |
| Article | `variants[0].sku` | not shown |
| Product name | `title` | always present |
| Dimensions | `metadata.dimensions` → formatted | not shown |
| Price | `variants[0].prices[0].amount` | not shown |

---

## Grouped Bed Card

```
┌────────────────────────────────┐
│         [bed image]            │
├────────────────────────────────┤
│ Greenwich                      │  ← collection label (small, muted)
│ Кровать                        │  ← h3, display_group_title (no redundant "Greenwich")
│ от 71 900 ₽                   │  ← min price with "от" prefix
│ 5 размеров                    │  ← variant count hint
└────────────────────────────────┘
```

### Field sources
| Visual element | Source | Fallback |
|----------------|--------|----------|
| Collection label | `metadata.collection_label` of representative | not shown |
| Group title | `metadata.display_group_title` | `title` of representative |
| Price | min across group members | single product price |
| Variant count | group member count | not shown |
| Article | omitted (multiple SKUs) | — |
| Dimensions | omitted (vary by size) | — |

---

## Product Detail Page (PDP)

```
Greenwich                         ← collection label (small, muted, above title)
Комод                             ← h1, canonical name
Арт. GR-05-1                     ← article (muted)
Ш. 1244 × Гл. 512 × В. 630 мм   ← dimensions (labeled, full format)

109 500 ₽                        ← price (prominent)

Greenwich — Комод                 ← description (existing field, unchanged for now)

[product image + gallery]
```

### PDP field sources
| Visual element | Source | Fallback |
|----------------|--------|----------|
| Collection label | `metadata.collection_label` | not shown |
| Product name | `title` | always present |
| Article | `variants[0].sku` | not shown |
| Dimensions | `metadata.dimensions` → full labeled format | not shown |
| Price | `variants[0].prices[0].amount` | not shown |
| Description | `description` | not shown |

---

## Metadata Contract

Products carrying these metadata fields will receive structured display:

```json
{
  "collection": "greenwich",
  "collection_label": "Greenwich",
  "dimensions": {
    "height_mm": 630,
    "width_mm": 1244,
    "depth_mm": 512
  },
  "display_group": "greenwich-bed",
  "display_group_title": "Кровать",
  "display_group_sort": 1
}
```

All fields are optional. Missing fields produce graceful fallback (element simply not rendered).

---

## Dimensions Formatting

| Context | Format | Example |
|---------|--------|---------|
| Card (compact) | `{w} × {d} × {h}` | `1244 × 512 × 630` |
| PDP (labeled) | `Ш. {w} × Гл. {d} × В. {h} мм` | `Ш. 1244 × Гл. 512 × В. 630 мм` |

Order: width × depth × height (standard furniture convention).
