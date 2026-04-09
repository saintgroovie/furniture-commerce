# Asset URL Mapping Notes

Как local processed paths становятся stable production URLs.

---

## The Mapping Chain

```
Local processed path  →  Storage key  →  Public URL
```

| Step | Example |
|------|---------|
| Processed path | `data/processed/storefront-assets/oliver/OL-01-2_main.jpg` |
| Storage key | `products/oliver/OL-01-2_main.jpg` |
| Dev URL | `http://localhost:9000/uploads/products/oliver/OL-01-2_main.jpg` |
| Staging URL | `https://staging-api.woodright.ru/uploads/products/oliver/OL-01-2_main.jpg` |
| Production URL | `https://cdn.woodright.ru/products/oliver/OL-01-2_main.jpg` |

### How It Works

1. **Processed path → Storage key**: Strip `data/processed/storefront-assets/` prefix, prepend `products/`
2. **Storage key → Public URL**: Prepend environment-specific base URL

The storage key is the **stable intermediate identifier**. It doesn't change across environments.

---

## Why This Must Happen Before seed.ts

seed.ts needs to create Medusa products with image URLs. Those URLs must be:
- Accessible by the storefront at runtime
- Stable (not filesystem paths that only exist on the developer's machine)
- Environment-appropriate (different base URL for dev/staging/prod)

### What seed.ts Will Receive

```typescript
{
  title: "Шкаф для одежды 1-дв. с зеркалом",
  handle: "ol-01-2",
  images: [
    { url: `${ASSET_BASE_URL}/products/oliver/OL-01-2_main.jpg` }
  ]
}
```

Where `ASSET_BASE_URL` comes from environment configuration.

---

## Avoiding Filesystem Coupling

### Wrong approach

```typescript
// seed.ts — BAD: coupled to local filesystem
images: [{ url: "data/processed/storefront-assets/oliver/OL-01-2_main.jpg" }]
```

### Correct approach

```typescript
// seed.ts — GOOD: uses storage key with env-configurable prefix
const ASSET_BASE = process.env.ASSET_BASE_URL || "http://localhost:9000/uploads";
images: [{ url: `${ASSET_BASE}/products/oliver/OL-01-2_main.jpg` }]
```

The `asset-upload-manifest.json` provides the `target_storage_key` that seed.ts should use, prefixed with the environment's base URL.

---

## Upload Workflow (When Ready)

1. Read `asset-upload-manifest.json`
2. For each entry with `upload_status: "planned"`:
   a. Read local file at `processed_path`
   b. Upload to storage at `target_storage_key`
   c. Receive `public_url` from storage
   d. Update manifest entry: `upload_status: "uploaded"`, `public_url: "..."`
3. Save updated manifest
4. Feed public URLs into seed.ts generation

### For Medusa Local Storage (MVP)

```bash
# Copy processed files to Medusa uploads directory
cp -r data/processed/storefront-assets/* apps/backend/uploads/products/
```

Then URLs become `http://localhost:9000/uploads/products/{collection}/{filename}`.

### For S3 (Production)

```bash
aws s3 sync data/processed/storefront-assets/ s3://woodright-assets/products/
```

Then URLs become `https://cdn.woodright.ru/products/{collection}/{filename}`.

---

## What the Upload Manifest Provides

For each of the 441 files:

```json
{
  "processed_path": "data/processed/storefront-assets/oliver/OL-01-2_main.jpg",
  "target_storage_key": "products/oliver/OL-01-2_main.jpg",
  "upload_status": "planned",
  "public_url": null
}
```

After upload:

```json
{
  "processed_path": "data/processed/storefront-assets/oliver/OL-01-2_main.jpg",
  "target_storage_key": "products/oliver/OL-01-2_main.jpg",
  "upload_status": "uploaded",
  "public_url": "http://localhost:9000/uploads/products/oliver/OL-01-2_main.jpg"
}
```
