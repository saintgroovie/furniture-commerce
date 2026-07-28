# PREMIUM IMAGE CONTRACT (Option B)

## Categories

| Category | Delivery | Rationale |
|----------|----------|-----------|
| `CATALOG_CARD` | card derivative 720 / WebP q78 when `NEXT_PUBLIC_CATALOG_CARD_DERIVATIVES=1` | Grid thumbs; Phase H4 preserved |
| `ROOM_COMPOSITION` | **original** | Full-bleed interactive interiors |
| `HOME_HERO` | **original** | Full-bleed adult home hero |
| `KIDS_HERO` | **original** | Full-bleed kids landing hero |
| `LIFESTYLE_BLOCK` | **original** | Large editorial entry / craft / project shots |
| `LARGE_CTA` | **original** | Final home CTA interior background |

## API

```ts
resolveHomeImageSrc(src, { surface?: HomeImageSurface })
// default surface = CATALOG_CARD

<HomeImg surface="HOME_HERO" src={…} />
```

## Out of scope

- PDP
- Catalog PLP cards
- Derivative generator width/quality/format
- Option A lifestyle derivative profile
- Option C keep-as-is

## Rollback

Revert the surface-aware resolver / call-site props (or set all call sites back to default `CATALOG_CARD`). No media files to restore.
