# Package D — Implementation plan

## Phases

1. **Read-only Gallery Workspace** — summary, grid, filters, diagnostics, lazy preview, stock fallback.
2. **Mutations** — upload → attach (separated), reorder (dirty + save full replacement), set thumbnail, unlink with confirm.
3. **QA** — unit/component/browser, ABC regression, Codex `safe_to_commit`.

## View models

- `normalizeMediaUrl` — strip host for `/static|/uploads`; **preserve path case**
- `buildGalleryView` — cards, ranks, thumbnail badge, exact URL duplicates, missing thumb
- `buildImagesReplacementPayload` — fail if incomplete vs snapshot; reject empty
- `mediaFingerprint` — ordered ids+urls + updated_at for stale detection
- `validateUploadFile` — type/size/empty
- gallery dirty/save state for reorder

## Stale / last-image guards

- Pre-mutation reload + fingerprint match required for reorder/unlink/attach.
- Unlink disabled when gallery would become empty.

## API wrappers

- `uploadAdminFiles(files)`
- `updateAdminProductMedia({ thumbnail?, images? })` — never empty images unless explicit
- Always `fetchProductWorkspaceBundle` / product GET after mutation

## UI

`GalleryPanel` in Product Workspace tab `gallery`.

## Out of scope

Variant-media editor, physical asset delete, DAM, storefront edits, Package E.
