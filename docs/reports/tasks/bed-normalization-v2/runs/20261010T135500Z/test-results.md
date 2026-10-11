# Gates

- `tsx src/lib/mattress-size.fidelity.test.ts` exit 0 after the variant-unknown fallback fix. Output: `mattress-size.fidelity.test.ts: ok`
- `tsx src/lib/display-group.fidelity.test.ts` exit 0
- `yarn build` in `apps/storefront` exit 0 (TypeScript step included)
- Preview `127.0.0.1:3418`, two samples 5s apart: listener cwd is this worktree, `/` 200, CSS 200
- `GR-09-1` PDP contains `Размер спального места` and `90 × 200`, plus Высота / Ширина / Глубина
- `OL-85-2` PDP has no mattress spec row. The unknown token is only inside product metadata JSON
- `PV-15-1` on `:3418` shows the mattress spec. Fabric chips were confirmed on the already running `:3002` after the group split (`С тканью`, `Без ткани`)
- Sibling chips on this worktree's `:3418` preview are incomplete. `/store/catalog-products` from the running backend omits `status`, and this storefront keeps only `published`, so the PDP sibling list was empty. Fabric chips were seen on `:3002`, which is `runtime-candidate-main`, not this branch.
- Display-group UPDATE changed only `display_group`, `display_group_title`, and `display_group_sort`. Price rows were not in the statement. Readback amounts stayed 70300 for PV-15 and 77300 for PV-16.
