# Editorial copy pass 2026-10-10

Stacked on PR #301. Production is not touched by this pass: the packet below is applied only
with a separate owner approval through the importer gate.

## Sources (edit these)

- `families/*.json` - product copy by content family (one model / construction = one text;
  members add `extra` paragraphs only for a confirmed variant difference).
- `collections.json`, `categories.json` - collection and category intros.
- `source/catalog-snapshot.json` - public Store API snapshot the boards were built from.

## Generated (do not hand-edit)

```sh
cd apps/storefront
yarn dlx -q tsx scripts/editorial-copy-board.ts --dir ../../docs/product-copy/editorial-pass-20261010 --strict
```

- `product-editorial-copy-board.csv` - every PDP with KEEP / ADD / REWRITE / REMOVE / HOLD.
- `content-family-board.csv`, `collection-editorial-copy-board.csv`, `category-editorial-copy-board.csv`.
- `editorial-quality.json`, `editorial-report.md` - before/after metrics, repetition report, examples.
- `apply/editorial-copy-packet.json` + `.sha256` - the only importer input.

## Storage

Medusa `product.description` is the single place the copy lives. No storefront copy arrays,
no runtime generation. `subtitle`, title, handle, status, prices, options, media and metadata
are never written.

Collection / category intros: UI HOLD. `/catalog` filters are client-side state with a single
canonical URL and categories are a storefront taxonomy (`metadata.buyer_item_type`), not a
backend entity, so there is no page to put them on. Willie Winkie keeps its existing
`/kids/willie-winkie` lead. When collection pages exist, the intros belong in
`product_collection.metadata` through the same fail-closed importer pattern.

## Importer

`apps/backend/src/scripts/apply-editorial-copy.ts` (`medusa exec`), gate in
`apply-editorial-copy-gate.ts`, pure logic in `apps/backend/src/lib/editorial-copy/`.

- Strict packet parse: exact keys, `field = description`, `prod_*` ids, sorted unique handles.
- Before-state check per row: unknown id, handle mismatch or description drift fails the whole
  run before any write. Live value already equal to the target is a noop (re-runs are idempotent).
- Apply writes the rollback artifact first, updates `description` only, then re-reads and verifies.
- Production (every mode, dry-run included) needs `EDITORIAL_COPY_CONFIRM` and
  `EDITORIAL_COPY_PRODUCTION_ACK`; apply / rollback need `EDITORIAL_COPY_INPUT_SHA`.

```sh
# dry-run (no writes)
EDITORIAL_COPY_TARGET=local EDITORIAL_COPY_MODE=dry-run \
EDITORIAL_COPY_INPUT=../../docs/product-copy/editorial-pass-20261010/apply/editorial-copy-packet.json \
npx medusa exec ./src/scripts/apply-editorial-copy.ts

# apply: same + EDITORIAL_COPY_MODE=apply EDITORIAL_COPY_INPUT_SHA=<sha from .sha256> EDITORIAL_COPY_OUT_DIR=<dir>
# rollback: EDITORIAL_COPY_MODE=rollback, EDITORIAL_COPY_INPUT=<rollback artifact>, its canonical SHA
```

## Holds

- `ox-14-1` - the title names both the Oxford-1 complex and its lower bed, and the photos do not
  settle which item the page sells; current text kept until the owner confirms.
- `pr-06-1` - published after the snapshot (empty description); not in this packet.
