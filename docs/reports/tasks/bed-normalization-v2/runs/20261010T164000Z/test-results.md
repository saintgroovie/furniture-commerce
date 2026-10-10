# Gates

- `bed-display-group-public.fidelity.test.ts` exit 0
- `mattress-size.fidelity.test.ts` exit 0
- `display-group.fidelity.test.ts` exit 0
- `catalog-browse-projection.fidelity.test.ts` exit 0

The browse projection on this branch keeps `status: published`. The running `:9000` process is an older backend and still omits status, so its rows stay out of the public filter.
