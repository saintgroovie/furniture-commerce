# Test results - 20260909T232738Z

| Gate | Exit | Notes |
|---|---|---|
| editorial-pages.fidelity.test.ts | 0 | 7 names, no invented brands, EditorialDeck, no iframe |
| yarn typecheck | 0 | storefront `tsconfig.production.json` |
| yarn lint | 0 | 0 errors, 52 warnings (existing `@next/next/no-img-element`) |
| yarn build | n/a this run | `.next-build` 2026-09-09 21:11 already contains `ed-logo-card` / `ed-deck-stage` |
| preview :3143 | listen | durable `sf-3143-partners-finish`, cwd = this worktree |

Copy tweak `viewerFallback` is source-only until next rebuild; happy path uses slides, not fallback.
