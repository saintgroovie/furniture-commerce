# MVP media source unblock — operator pack (CO-02-1)

## Short verdict

**BLOCKED: source file required**

Automated resolution is **still_blocked** until a human provides the missing bytes at a path the executor can see (canonical mount **or** controlled static + governed ref update).

---

## Target

| Field | Value |
|--------|--------|
| Product / SKU | `CO-02-1` |
| Collection key | `country-london-paris` |
| **Required filename (exact)** | `co-02-1-blue-i1.jpg` |
| **Canonical expected source path** | `/WOODRIGHT/Контент /Фото на белом фоне /country /co-02-1-blue-i1.jpg` |
| **Controlled static target path** (Variant B only) | `apps/backend/static/products/country-london-paris/co-02-1-blue-i1.jpg` |

---

## Allowed resolution paths (pick one)

### Variant A — Mount / sync Yandex Disk (WOODRIGHT)

1. Mount or sync so the **canonical** path above exists on disk (same filename).
2. **Do not** hand-edit MVP dry-run / media-map to fake availability — the file must really exist at the path referenced by controlled artifacts (today: canonical `/WOODRIGHT/...`).
3. Run **dry-run only** (see verification).

### Variant B — No mount; confirmed file → repo static

1. Obtain the **confirmed** white-background image for **CO-02-1** — it must be **this** asset (`co-02-1-blue-i1.jpg`), not a substitute SKU or different shot.
2. Place **only** that single file at:  
   `apps/backend/static/products/country-london-paris/co-02-1-blue-i1.jpg`  
   (create directories if needed; do not bulk-copy other assets.)
3. In a **separate governed change** (not part of this pack), update controlled MVP media artifacts so `selected_primary_image_path_or_ref` (or equivalent) points to the **absolute** path that exists on the machine running `yarn mvp-media-assignments` (e.g. full path under the repo). Until refs point at an existing path, executor will stay `local_path_missing`.
4. Run **dry-run only** (see verification).

---

## Forbidden

- Do **not** substitute another file or rename a different asset to `co-02-1-blue-i1.jpg`.
- Do **not** change dry-run eligibility or verdicts by hand without a real file + governed ref alignment.
- Do **not** run apply:  
  `MVP_MEDIA_ASSIGNMENTS_APPLY_CONFIRM=1 yarn mvp-media-assignments -- --apply`
- Do **not** change product records, metadata, readiness/stage, `catalog-scope.ts`, or storefront runtime as part of “unblocking source”.
- Do **not** modify Oxford / Monchelsea / Willie Winkie / Oliver Kids rows in MVP media artifacts while fixing `CO-02-1`.

---

## Verification checklist (operator)

1. **File exists** at either canonical path (Variant A) or static path (Variant B), and for Variant B the controlled JSON ref matches that absolute path after your governed update.
2. **File is correct** — visually confirm it is the intended **CO-02-1** white-background hero (same asset as canonical Yandex naming), not another product.
3. Run **dry-run only**:  
   `cd apps/backend && yarn mvp-media-assignments`
4. **Expected** for `CO-02-1` in `storefront-mvp-media-assignment-executor-dry-run.json`:  
   - `apply_allowed_in_future` **true**  
   - reason line includes `pre_apply_source=local_path_exists` (or valid `http(s)` if you later use a governed URL ref lane).

---

## Next command after file appears (dry-run only)

```bash
cd apps/backend && yarn mvp-media-assignments
```

---

## Future apply gate (do not run until explicitly approved)

```bash
MVP_MEDIA_ASSIGNMENTS_APPLY_CONFIRM=1 yarn mvp-media-assignments -- --apply
```

Use only after governance sign-off; this pack does **not** authorize apply.

---

## Automated verification pass (Cursor, 2026-05-02)

- **Variant detected:** `still_blocked`
- **Canonical path present:** no (`/WOODRIGHT/Контент /Фото на белом фоне /country /co-02-1-blue-i1.jpg`)
- **Static path present:** no (`apps/backend/static/products/country-london-paris/co-02-1-blue-i1.jpg`)
- **Governed ref alignment (Variant B):** not performed (static file missing)
- **Dry-run executed:** `cd apps/backend && yarn mvp-media-assignments`
- **Result for CO-02-1:** `apply_allowed_in_future` remains **false**; `pre_apply=local_path_missing`

When operator completes A or B, re-run this verification (filesystem checks + dry-run only) and update `storefront-mvp-media-source-contract.json` / this section with measured outcomes.
