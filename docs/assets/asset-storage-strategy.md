# Asset Storage Strategy

Стратегия размещения processed product assets для production-facing URLs.

---

## Storage Options

### Option A: Medusa Local File Storage (Recommended for MVP)

Medusa v2 includes a default local file module. No explicit `fileService` provider is configured in `medusa-config.ts`, which means Medusa uses its built-in local file handling.

| Aspect | Detail |
|--------|--------|
| Setup | Zero — already available |
| Upload | Via Admin API or seed script |
| URL pattern | `http://localhost:9000/uploads/{filename}` (dev) |
| Persistence | Local filesystem, inside Docker volume |
| CDN | None — acceptable for MVP/staging |
| Cost | Free |

**Pros:** No infrastructure setup. Works with existing Docker Compose setup. Perfect for MVP/staging.
**Cons:** No CDN, not suitable for high-traffic production. Tied to single server.

### Option B: S3-Compatible Storage (Recommended for Production)

MinIO (self-hosted) or AWS S3 with Medusa's `@medusajs/file-s3` module.

| Aspect | Detail |
|--------|--------|
| Setup | Add S3 module + configure credentials |
| Upload | Via S3 SDK or Medusa Admin API |
| URL pattern | `https://{bucket}.s3.{region}.amazonaws.com/products/{key}` |
| Persistence | Cloud object storage |
| CDN | CloudFront or similar |
| Cost | Minimal for small catalog (~20MB) |

**Pros:** Production-grade, CDN-ready, scalable.
**Cons:** Requires infrastructure setup, credentials management.

### Option C: Static Asset Directory (Simplest)

Place processed files directly in the storefront `public/` directory.

| Aspect | Detail |
|--------|--------|
| Setup | Copy files to `apps/storefront/public/products/` |
| URL pattern | `/products/{collection}/{filename}` |
| Persistence | Part of deployment artifact |
| CDN | Via Next.js static serving or Vercel/Netlify CDN |

**Pros:** Simplest possible approach. CDN-ready via Next.js hosting.
**Cons:** Images in git (20MB+). Tight coupling between assets and code deployment.

---

## Recommendation

**Phase 1 (MVP/Staging):** Option A — Medusa local file storage. Zero setup, good enough for development and demo.

**Phase 2 (Production):** Option B — S3 with CDN. Configure when preparing for public launch.

**Not recommended:** Option C for this project size (441 files, 20MB). Git bloat and deployment coupling outweigh simplicity.

---

## Storage Key Naming Strategy

Regardless of storage backend, use consistent key structure:

```
products/{collection}/{filename}
```

Examples:
```
products/oliver/OL-01-2_main.jpg
products/oliver/OL-01-2_gallery_01.jpg
products/oliver/OL-07-1_color_leona_01.jpg
products/provence/PV-02-1_main.jpg
products/country-london-paris/CO-02-1_color_blue_01.jpg
```

### Key Rules

1. **Lowercase collection** name as first directory
2. **Uppercase product code** in filename (matches workbook convention)
3. **Role suffix** (`_main`, `_gallery_NN`, `_color_HINT_NN`)
4. **Always `.jpg`** extension
5. **No spaces, no special characters** in keys
6. **Deterministic** — same input always produces same key

---

## Public URL Strategy

### Development (Medusa local)

```
http://localhost:9000/uploads/products/oliver/OL-01-2_main.jpg
```

### Staging

```
https://staging-api.woodright.ru/uploads/products/oliver/OL-01-2_main.jpg
```

### Production (S3 + CDN)

```
https://cdn.woodright.ru/products/oliver/OL-01-2_main.jpg
```

The **storage key** (`products/oliver/OL-01-2_main.jpg`) remains identical across environments. Only the **base URL prefix** changes.

---

## Provenance Preservation

Each uploaded asset should be traceable back to:

```
public URL → storage key → processed file → raw downloaded file → Yandex Disk source
```

This chain is maintained through:
- `asset-upload-manifest.json` (processed_path → storage_key → public_url)
- `processed-assets.json` (source_raw_path → processed_path)
- `disk-download-status.json` (source_ref → raw file → SHA-256)

---

## Main / Gallery / Color Variant Handling

| Role | Storage key pattern | Usage in storefront |
|------|-------------------|-------------------|
| main | `products/{coll}/{CODE}_main.jpg` | Product card thumbnail, PDP hero |
| gallery | `products/{coll}/{CODE}_gallery_{NN}.jpg` | PDP additional views carousel |
| color_variant | `products/{coll}/{CODE}_color_{hint}_{NN}.jpg` | Color option swatches / variant images |

---

## Quality Exception Handling in Storage

| Quality flag | Upload? | Storage note |
|-------------|---------|-------------|
| `ok` | Yes | Standard upload |
| `gallery_only` | Yes | First gallery serves as main |
| `legacy_fallback` | Yes | Mark as legacy in metadata |
| `low_res_temporary` | Yes | Flag for future replacement |
| `needs_reshoot` | Yes (with warning) | PV-68-1 only; flagged prominently |
| `pdf_temporary` | Not in this batch | Future phase |
| `blocked` | No | Excluded from upload |
| `missing` | No | Excluded from upload |

All caveated items are uploaded but tracked in the manifest with their quality flags intact.
