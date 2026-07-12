# Package F — Implementation plan (matrix)

**Date:** 2026-07-12 (MSK)  
**Scope:** dashboard + cross-package consistency + docs. No migrations, no custom write APIs, Medusa 2.13.3 stock Admin REST only.

| # | Item | Audit ref | Files | Status |
|---|------|-----------|-------|--------|
| 1 | Shared browser flag reader | F-02 | `lib/woodright/browser-flag.ts` (+test) | done |
| 2 | Stock Admin label + paths | F-01 | `lib/woodright/stock-admin.ts` (+test) | done |
| 3 | Shared error toast | F-05 | `lib/woodright/toast-admin-error.ts`; used in VariantsPricesPanel, GalleryPanel | done |
| 4 | Shared save-state labels | F-14 | `lib/woodright/save-state-labels.ts` (+test); `save-state.ts` delegates | done |
| 5 | UI copy dictionary | F-06/F-07 | `lib/woodright/ui-copy.ts` (+test) | done |
| 6 | Dashboard `/app/woodright` | F-12 | `routes/woodright/page.tsx`, `lib/woodright/dashboard-api.ts`, `lib/woodright/dashboard-model.ts` (+test) | done |
| 7 | Honest counters | contract | draft = `limit=1` + `count`; thumbnails = sample ≤ 3×50 with «оценка по выборке»; promotions attention = link only, no fake total | done |
| 8 | Product tab deep links | F-13 | `products/[id]/page.tsx` `?tab=` sync | done |
| 9 | Remove useless nested sidebar item | F-04 | `products/[id]/page.tsx` (config removed) | done |
| 10 | Stub tabs badged «скоро» | F-03 | inventory / seo tabs | done |
| 11 | Promotions list `?filter=` deep link | F-11 note | `promotions/page.tsx` | done |
| 12 | Widgets: shared flag + dashboard link | F-02 | both widgets | done |
| 13 | Unused imports cleanup on touch | F-09 | `products/[id]/page.tsx` | done |
| 14 | Terminology map update | F-07 | `terminology-map.md` | done |
| 15 | Operator guide rewrite | F-15 | `operator-guide.md` | done |
| 16 | Error catalog sync | F-07 | `error-message-catalog.md` | done |

## Out of scope (unchanged from audit)

- Server-side promotion status filters / global attention counter (API limitation, F-08 accepted)
- Inventory editor, SEO editor, new promotion types
- Node 20 gate, browser QA, git commit (parent workflow)
