# Package D — Media contract (Medusa 2.13.3)

**Proven on:** isolated DB `medusa-admin-ux-b5`, Admin API `:9001`, 2026-07-12 (MSK)

## Source of truth

| Field | Role |
|-------|------|
| `product.thumbnail` | string URL — **главное** изображение (hero) |
| `product.images[]` | `{ id, url, rank, … }` — **галерея** (порядок = массив / `rank`) |

Не SoT: metadata gallery, frontend-only store, отдельная DAM.

`variant.images` в Admin API **возвращает те же product images** (не отдельный operator contract). Storefront не использует variant gallery как SoT → **variant-media editor не реализуется**.

## Read

```
GET /admin/products/:id?fields=id,thumbnail,*images
```

Images include `id`, `url`, `rank`, timestamps. Metadata usually `null` on B5 fixtures.

## Upload

```
POST /admin/uploads
Content-Type: multipart/form-data
field: files
```

Response: `{ files: [{ id, url }] }`.

**Caution:** absolute `url` may use `MEDUSA_BACKEND_URL` host/port (e.g. `:9000` while server is `:9001`). File is served from the running backend under `/static/...`. **Normalize to pathname** (`/static/...`) before attach.

## Attach / reorder / unlink

```
POST /admin/products/:id
{ "images": [ { "id"?: string, "url": string }, ... ] }
```

**Semantics: FULL REPLACEMENT** (proven):

| Payload | Result |
|---------|--------|
| Full list with ids, reordered | Order/rank updated; ids preserved |
| Subset of images | Omitted images **unlinked** from product |
| `images: []` | Gallery **cleared** |
| Omit `images` key | Gallery unchanged |

Unlink = remove from replacement array. **Does not prove physical storage delete.** Package D only unlinks from the product.

## Thumbnail

```
POST /admin/products/:id
{ "thumbnail": "<url>" | null }
```

- Thumbnail-only update **does not** wipe `images`.
- Thumbnail **may live outside** `product.images` (common on B5 fixtures).
- Setting thumbnail does not auto-append URL into `images`.

## Authoritative reload

After every mutation: `GET` product with `*images` + `thumbnail`, compare expected order/urls/thumb, then success UI.

## Fail-closed rules for Package D

1. Never send incomplete `images` array.
2. Never send `images: []` — Package D blocks unlink when it would clear the gallery (last image stays; use stock Admin for clear-all).
3. Before every images replacement: authoritative reload; compare `updated_at` + ordered image id/url fingerprint; abort on divergence (stale).
4. Reorder/unlink/attach rebuild from that fresh snapshot only.
5. Upload success ≠ attach success — report separately.
6. Prefer relative `/static/...` URLs in attach payloads (preserve path case).
7. Duplicate diagnostics: exact match after host-strip **without** lowercasing the path.
