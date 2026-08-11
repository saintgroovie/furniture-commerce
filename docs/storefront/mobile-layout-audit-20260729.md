# Mobile layout audit evidence — 2026-07-29

Stacked branch: `fix/mobile-layout-audit-20260729` on PR #53 + `origin/main`.

## Live demo identity (baseline)

- URL: https://woodright-demo.ru
- Time: 2026-07-29 02:07 MSK / 01:07 CEST
- `x-woodright-release-sha`: `acfe45073f90bb52087c68746da3a7b8bc788d77`
- `x-woodright-runtime-role`: `public_demo`
- `x-woodright-database-identity`: `public_demo_db`
- `x-robots-tag`: `noindex, nofollow, noarchive`
- Contacts on live: placeholder («Шоурум: Москва», no phones/map) — PR #53 not deployed
- Nav order on live: Каталог → Детская → Комнаты (non-canonical)

## Local verification

- Durable production storefront: `127.0.0.1:3136` (`sf-3136`, worktree cwd verified)
- Backend: local `:9000` (read/write isolated; no demo writes)
- `yarn build` PASS
- `yarn typecheck` PASS
- `yarn test:fidelity` PASS (35 files)
- `WOODRIGHT_A11Y_BASE_URL=http://127.0.0.1:3136 yarn test:a11y-dialogs` PASS
- `WOODRIGHT_A11Y_BASE_URL=http://127.0.0.1:3136 yarn test:mobile-layout` PASS

## Screenshots

Optional local PNGs under `artifacts/mobile-audit-20260729/after/` (not committed).

## Assumption

Demo interactive a11y (dialog/inert) already lands with PR #53 stack; this branch adds overflow/nav/cart SSR fixes + regression smokes on top.
