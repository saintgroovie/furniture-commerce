# Disk Asset Download & Preprocess Strategy

Стратегия скачивания и подготовки white-background product images с Yandex Disk.

---

## Scope

Первая волна: **Oliver** (253 файла) и **Provence** (63 файла).
Все файлы — product photography на белом фоне, source of truth для storefront imagery.

---

## Download Process

### Step 1: Build Download Manifest

Скрипт `scripts/prepare-disk-asset-manifest.py` формирует список файлов для скачивания:
- Читает `production-subset-skeleton.json` → коды подтверждённых продуктов
- Читает `front-manifest.json` → все disk assets с matching codes
- Генерирует `disk-download-manifest.json` с target paths и статусами

### Step 2: Fetch Download URLs

Yandex Disk public API возвращает временный download URL:

```
GET https://cloud-api.yandex.net/v1/disk/public/resources/download
  ?public_key=<DISK_PUBLIC_KEY>
  &path=<encoded_disk_path>
```

Response: `{"href": "https://downloader.disk.yandex.ru/..."}` — URL expires after ~30 minutes.

**Правило:** download URL запрашивается и используется немедленно в рамках одного скрипта.
Никогда не сохранять download URLs в manifest или базу данных.

### Step 3: Download to Local Storage

Файлы сохраняются в `data/raw/downloaded-assets/{collection}/{filename}`.
Оригинальные имена файлов сохраняются как есть для traceability.

### Step 4: Validate

После скачивания:
- Проверить, что файл является валидным изображением (PIL.Image.open + verify)
- Проверить минимальный размер (>10KB, чтобы отсечь placeholder/broken files)
- Записать SHA-256 hash для dedup и integrity

---

## Avoiding Ephemeral URL Dependency

| Что | Правило |
|-----|---------|
| `source_ref` в manifest | Yandex Disk path (metadata), НЕ download URL |
| Download URL | Запрашивается at download time, используется однократно |
| Downloaded file | Сохраняется локально, это source of truth |
| Production URL | Генерируется только после upload в production storage |

---

## Naming Convention

### Raw downloaded files

Сохраняются с **оригинальным именем** из Yandex Disk:
```
data/raw/downloaded-assets/oliver/ol-01-2-i1.jpg
data/raw/downloaded-assets/oliver/ol-01-2-i2.jpg
data/raw/downloaded-assets/oliver/ol-01-2-i3.jpg
data/raw/downloaded-assets/provence/pv-02-1-i1.jpg
```

### Processed storefront-ready files

Переименовываются в normalized формат:
```
data/processed/storefront-assets/oliver/OL-01-2_main.jpg
data/processed/storefront-assets/oliver/OL-01-2_gallery_01.jpg
data/processed/storefront-assets/oliver/OL-01-2_gallery_02.jpg
data/processed/storefront-assets/provence/PV-02-1_main.jpg
```

Шаблон: `{PRODUCT_CODE}_{role}[_{index}].{ext}`
- `role`: `main` | `gallery` | `color_{color_hint}`
- `index`: двузначный (01, 02, ...)
- `ext`: всегда `.jpg` (или `.webp` при конвертации)

### Color variants (Oliver OL-23-1)

Файлы типа `ol-23-1-leona-010.jpg` → `OL-23-1_color_leona_01.jpg`

---

## Folder Structure

```
data/
├── raw/
│   └── downloaded-assets/           ← originals as-downloaded
│       ├── oliver/
│       └── provence/
├── processed/
│   ├── storefront-assets/           ← renamed, optimized, web-ready
│   │   ├── oliver/
│   │   └── provence/
│   └── asset-manifests/             ← tracking metadata
│       ├── disk-download-manifest.json
│       ├── disk-download-summary.json
│       └── download-log.json        ← per-file download results
```

---

## Preprocessing Pipeline

### Format normalization
- Input: JPEG (predominant), possibly PNG
- Output: JPEG quality 85 (main), JPEG quality 80 (thumbnails)
- Optional: WebP versions for modern browsers

### Dimension checks
- Minimum: 800×800 px (flag as `low_res` if smaller)
- Maximum: 4000×4000 px (downsample to 2000×2000 for web)
- Storefront target: 1200×1200 px (main), 400×400 px (thumbnail)

### Background consistency
- White-background images: verify avg corner pixel brightness > 240
- Flag non-white backgrounds for manual review

### Duplicate handling
- SHA-256 hash each file after download
- Detect exact duplicates across different filenames
- Keep one copy, note duplicates in manifest

### File naming by product code
- Parse original filename → extract product code
- Rename to `{CODE}_{role}_{idx}.jpg`
- Preserve original filename in provenance metadata

---

## Source Provenance Metadata

Each downloaded file gets a provenance record in `download-log.json`:

```json
{
  "original_filename": "ol-01-2-i3.jpg",
  "disk_path": "/WOODRIGHT/Babysecret/Oliver/Фото на белом фоне /ol-01-2-i3.jpg",
  "product_code": "OL-01-2",
  "collection": "oliver",
  "downloaded_at": "2026-03-18T...",
  "sha256": "abc123...",
  "file_size_bytes": 312000,
  "image_dimensions": [1200, 900],
  "target_raw_path": "data/raw/downloaded-assets/oliver/ol-01-2-i3.jpg",
  "target_processed_path": "data/processed/storefront-assets/oliver/OL-01-2_main.jpg",
  "status": "downloaded | failed | duplicate | low_res"
}
```

---

## Safety Rules

1. **Never store download URLs** — they are ephemeral
2. **Never reference disk paths as production URLs** — they are metadata
3. **Always validate after download** — check image integrity
4. **Separate raw from processed** — raw files are immutable archive
5. **Track provenance** — every processed file links back to its source
6. **No application code changes** — this is data preparation only
