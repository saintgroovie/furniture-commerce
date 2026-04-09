# Preferred Asset Download Plan

План скачивания и подготовки disk images для storefront.

---

## Download Priority

| Priority | Collection | Items | Disk Images | Rationale |
|----------|-----------|-------|-------------|-----------|
| 1 | **Oliver** | 67 | 58 preferred + 238 available | Highest coverage (94%), most complete |
| 2 | **Provence** | 29 | 23 preferred + 69 available | High coverage (83%), clean set |
| 3 | **Country** | 13 | 4 preferred + 112 available | Growing coverage, many PDF→disk upgrades |
| 4 | **Monchelsea** | 32 | 2 preferred + 17 available | Medium coverage, limited disk assets |
| 5 | **Princess Rose** | 20 | 0 preferred + 8 available | Good coverage from legacy, few disk assets |
| 6 | **Accessories** | 3 | 0 preferred + 62 available | Small subset, but dedicated folder exists |

---

## Download Process

### Step 1: Generate Download URLs

Yandex Disk public API download endpoint:

```
GET https://cloud-api.yandex.net/v1/disk/public/resources/download
  ?public_key=https://disk.yandex.ru/d/MgKkDh5ZLXXfow
  &path={encoded_path}
```

Returns `{"href": "https://downloader.disk.yandex.ru/..."}` — a temporary download URL.

### Step 2: Download to Local Storage

```
data/downloaded-assets/
├── oliver/
│   ├── ol-01-2-i1.jpg
│   ├── ol-01-2-i2.jpg
│   └── ...
├── provence/
│   ├── pv-02-1-i1.jpg
│   └── ...
├── country/
│   ├── co-02-1-i1.jpg
│   └── ...
└── ...
```

### Step 3: Preprocessing

For each downloaded image:

1. **Validate** — check file is a valid image, not corrupted
2. **Resize** — create web-optimized versions:
   - Main: 1200×1200 max, JPEG quality 85
   - Thumbnail: 400×400, JPEG quality 80
3. **Convert** — optionally generate WebP versions
4. **Hash** — compute content hash for deduplication
5. **Rename** — standardize to `{code}_{index}.{ext}` format

### Step 4: Upload to Production Storage

Target: Medusa-compatible file storage (S3, MinIO, local `uploads/` folder).

Map `source_ref` → production URL in a lookup file.

---

## Why This Must Be a Separate Step

1. **Yandex Disk URLs are ephemeral** — download links expire, cannot be used as production image URLs
2. **Image quality varies** — some images need resizing/optimization before web use
3. **No CDN caching** — direct Yandex Disk downloads have no CDN, latency is high
4. **Medusa requires stable URLs** — seed.ts needs permanent, accessible image paths
5. **Reproducibility** — downloaded assets should be committed/stored, not re-fetched each time

---

## Avoiding Ephemeral URL Dependency

| Current state | Problem | Solution |
|--------------|---------|----------|
| `source_ref` = Yandex Disk path | Not a URL, just metadata | Generate download URL via API at fetch time |
| Legacy URLs | Site is unstable | Download and store locally |
| PDF extracted images | Local dev files | Process and upload to production storage |

### Rule: No asset URL in seed.ts should point to Yandex Disk or woodright.ru

All storefront images must be served from:
- Medusa's configured file storage
- A CDN-backed storage bucket
- Or local `uploads/` for development

---

## Estimated Effort

| Task | Complexity | Items |
|------|-----------|-------|
| Download Oliver white-bg | Low | ~238 files, ~50MB |
| Download Provence white-bg | Low | ~69 files, ~15MB |
| Download Country white-bg | Low | ~112 files, ~25MB |
| Download Accessories | Low | ~62 files, ~15MB |
| Preprocessing pipeline | Medium | Script + validation |
| Upload to storage | Medium | Depends on infra |
| URL mapping file | Low | JSON lookup |

Total estimated: **~500 files, ~120MB raw**, ~50MB after optimization.

---

## Script Outline

A future `scripts/download-preferred-assets.py` should:

1. Read `production-subset-skeleton.json`
2. For each item with `preferred_image_source.type == "disk_white_bg"`:
   a. Call Yandex Disk download API
   b. Save to `data/downloaded-assets/{collection}/{filename}`
   c. Log success/failure
3. For legacy-source items: optionally download from cached legacy URLs
4. Generate `data/downloaded-assets/download-manifest.json`

This script is **not yet built** — it should be created as a separate task when download is approved.
