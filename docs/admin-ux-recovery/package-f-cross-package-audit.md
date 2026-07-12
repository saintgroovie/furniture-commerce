# Package F — Cross-package UX audit (A–E)

**Date:** 2026-07-12 (MSK)  
**Method:** code review of Admin extension surface + docs drift.

## Issues

| ID | Package | Severity | Scenario | Description | Fix in F | Status |
|----|---------|----------|----------|-------------|----------|--------|
| F-01 | B–E | P2 | Stock fallback | Five wordings for stock Admin link | Shared label «Стандартная админка Medusa» + helper | fixed |
| F-02 | B–E | P2 | Flag | `readFlagFromBrowser` duplicated 5×; product widget misses `window.__…__` | Single browser flag reader | fixed |
| F-03 | B | P2 | Tabs | Inventory / SEO tabs look equal but are stubs | Badge «скоро» | fixed |
| F-04 | B | P2 | Sidebar | «Woodright товар» nested route without id | Landing entry; removed nested product [id] sidebar label | fixed |
| F-05 | C/D vs pages | P3 | Toasts | Two error toast formats | Shared `toastAdminError` | fixed |
| F-06 | A–E | P3 | Typography | Mixed em dashes in RU copy | Prefer ` - ` in F ui-copy / touched strings | fixed |
| F-07 | Docs | P2 | Terms | Map/guide lag C/D/E; «Продвижение» vs «Акции» | Updated terminology + operator guide | fixed |
| F-08 | E | P3 | Filters | Client-side promo filters on one page | Keep honesty note | accepted |
| F-09 | B | P3 | Imports | Unused imports in product page | Cleaned on touch | fixed |
| F-10 | C/E | P3 | Imports | `.ts` extension inconsistency | Prefer no extension in new F code | accepted |
| F-11 | E | P2 | Flag off | Sidebar «Акции» visible when flag off | Documented; content gated; landing primary | accepted |
| F-12 | F | P1 | Entry | No Woodright home/dashboard | `/app/woodright` implemented | fixed |
| F-13 | B | P2 | Deep link | Product tab not in URL | `?tab=` | fixed |
| F-14 | B–E | P2 | Save state | Save-state only on product overview | Shared labels helper | fixed |
| F-15 | Docs | P1 | Handbook | operator-guide still Package A draft | Rewritten | fixed |

## Out of scope for F

- New inventory editor, new promotion types, gallery/price engine changes
- Server-side promotion status filters (API limitation)
- New RBAC system
