# Front / Disk Product Photography Review Strategy

## Discovery

The `/Front` folder at root level and `/WOODRIGHT/Front` are both **empty** (0 files accessible via API).

The actual clean product photography is located in:

| Folder | Items | Image format | Naming pattern |
|--------|-------|-------------|----------------|
| `/WOODRIGHT/Контент /Фото на белом фоне /country` | 112+ | JPG | `co-02-1-blue-i1.jpg` |
| `/WOODRIGHT/Контент /Фото на белом фоне /provence` | 69 | JPG | `pv-02-1-i1.jpg` |
| `/WOODRIGHT/Контент /Фото на белом фоне /Willie Winke` | 414+ | JPG | `al-01-1-i1.jpg` |
| `/WOODRIGHT/Контент /Фото на белом фоне /Стулья` | 107+ | JPG | `MNm-c-23-1-leona160.jpg` |
| `/WOODRIGHT/Контент /Фото на белом фоне /america` | 45 | JPG | `am-02-1-i1.jpg` |
| `/WOODRIGHT/Контент /Фото на белом фоне /Sweat Home` | 10 | TIF | `DSC00354.tif` |
| `/WOODRIGHT/Babysecret/Oliver/Фото на белом фоне` | 238+ | JPG | `ol-01-2-i1.jpg` |
| `/WOODRIGHT/Контент /Аксессуары` | 67+ | JPG | `a-31-1-los.jpg` |
| `/WOODRIGHT/Контент /Шкафы` | 59 | JPG/PNG | `co-62-1-i3.jpg` |
| `/WOODRIGHT/Контент /Коллекции /Oxford` | 7 | JPG | `Oxford 1.jpg` |

---

## Naming Patterns

### Pattern 1: Article code + image index (STRONGEST)

```
{prefix}-{number}-{variant}-i{index}.jpg
```

Examples: `co-02-1-i1.jpg`, `pv-03-1-i2.jpg`, `ol-26-2-i3.jpg`

- `co` → Country collection, prefix CO
- `pv` → Provence, prefix PV
- `ol` → Oliver, prefix OL
- `al` → Willie Winkie / Albion painting prefix AL
- `mn` → Monchelsea, prefix MN
- `MNm` → Monchelsea modular, prefix MNm
- `a` → Accessories, prefix A

Confidence: **0.9** — direct article code mapping.

### Pattern 2: Article code + color variant

```
{prefix}-{number}-{variant}-{color}-i{index}.jpg
```

Examples: `co-02-1-blue-i1.jpg`, `co-02-1-grey-i1.jpg`

Confidence: **0.85** — same product in different finish.

### Pattern 3: Article code + suffix

```
{prefix}-{number}-{variant}-{suffix}.jpg
```

Examples: `a-31-1-los.jpg`, `a-31-1h-i1.jpg`

The suffix `-los` or `-h` may indicate angle or detail view.

Confidence: **0.8** — article code present but suffix meaning unclear.

### Pattern 4: No article code (WEAK)

```
IMG_XXXX.JPG, DSC00XXX.tif, descriptive-name.jpg
```

Confidence: **0.2** — no machine-matchable code.

---

## Asset Kind Classification

| Kind | Criteria | Use |
|------|----------|-----|
| `product_main` | `-i1` suffix, largest in group | Primary storefront image |
| `product_angle` | `-i2`, `-i3`, etc. | Gallery images |
| `product_color_variant` | color word in filename | Variant display |
| `dimension_diagram` | in `/Размеры/` folder | PDP spec section |
| `color_swatch` | `mn-color-*` pattern | Color selector |
| `unclassified` | no recognizable pattern | Manual review |

---

## When Disk Image Replaces PDF Candidate

A disk white-background product shot **replaces** a PDF candidate when:

1. Article code matches exactly
2. Image is a clean product shot (white bg, single product)
3. Resolution ≥ 400×400 px
4. Source is a known "Фото на белом фоне" folder

A disk image is **preferred over** legacy scrape when:
- The disk image is higher resolution
- The disk image is a clean white-background shot vs. a website thumbnail

---

## Confidence Mapping

| Evidence | Confidence | Status |
|----------|-----------|--------|
| Exact article code from filename + white bg folder | 0.9 | `disk_verified` |
| Article code + color suffix | 0.85 | `disk_verified` |
| Article code fragment + same collection folder | 0.8 | `disk_candidate` |
| Folder-level collection only, no code | 0.3 | `disk_candidate` |
| No code, unrelated folder | 0.1 | Not used |

---

## Architectural Safety

- Files are inventoried via API metadata only (no download required for manifest)
- Download URLs are generated on-demand from Yandex Disk API
- No backend/storefront code modified
- No data imported into Medusa
- Disk images marked separately from legacy/PDF sources
