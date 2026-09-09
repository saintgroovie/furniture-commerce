# Scope - partners-legacy-index

- Trigger: `луп до пуша`
- Mode: full until exhausted
- Type pack: `storefront` (secondary: partner public data fallback)
- Commit intent: yes (Codex `safe_to_commit` required)
- Worktree: `/Users/leonidmbp/.woodright/worktrees/partners-contacts-finish-20260909`
- Branch: `feat/partners-legacy-index-20260909`

## In-scope pathspecs

- `apps/storefront/src/lib/legacy-partners.ts`
- `apps/storefront/src/lib/api/partners.ts`
- `apps/storefront/src/lib/woodright-copy.ts`
- `apps/storefront/src/lib/editorial-pages.fidelity.test.ts`
- `apps/storefront/src/components/partners/partner-index.tsx`
- `apps/storefront/src/components/partners/presentation-viewer.tsx`
- `apps/storefront/src/app/partners/page.tsx`
- `apps/storefront/src/app/partners/[slug]/page.tsx`
- `apps/storefront/src/app/partners/[slug]/presentations/[presentationId]/page.tsx`
- `apps/storefront/src/app/globals.css`
- `docs/reports/tasks/partners-legacy-index/**`

## Out of scope

- `apps/backend/node_modules` (never commit)
- Invented brands (Novikov / Фиолет / Русский Дизайнерский Дом / ГАБТ)
- Third-party logo files / PDF uploads
- Prod DB / seed / media-apply
- Canonical `:3002` / `:9000` LaunchAgents
- woodright.ru cutover
- Contacts masthead (already on main)

## Dirty isolation

Unrelated: `apps/backend/node_modules` only. Do not stage.
