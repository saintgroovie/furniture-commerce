# Editorial copy pass 2026-10-10

Stacked on PR #301. Production is not touched by this pass: the packet below is applied only
with a separate owner approval through the importer gate.

## Sources (edit these)

- `families/*.json` - product copy by content family (one model / construction = one text;
  members add `extra` paragraphs only for a confirmed variant difference).
- `collections.json`, `categories.json` - collection and category intros.
- `source/catalog-snapshot.json` - public Store API snapshot the boards were built from
  (248 published PDP, read-only GET, refreshed for the final polish).
- `final-polish-audit.json` - final editorial polish: per-family status before / after
  (`GOOD`, `POLISH`, `TOO_THIN`, `TOO_TECHNICAL`, `GENERIC`, `AWKWARD`, `FACT_RISK`, `NEW`, `HOLD`),
  the reason for each rewrite and the owner review examples.
- `source/baseline-packet.json` - frozen PR #305 packet (byte-identical to the packet at
  `f810c4d8`); the generator takes "before" texts only from it and checks its canonical sha
  against the audit. `--strict` fails on an unexplained change, an unpolished non-GOOD family,
  a missing entry or a baseline sha / count mismatch.

## Generated (do not hand-edit)

```sh
cd apps/storefront
yarn dlx -q tsx scripts/editorial-copy-board.ts --dir ../../docs/product-copy/editorial-pass-20261010 --strict
```

- `product-editorial-copy-board.csv` - every PDP with KEEP / ADD / REWRITE / REMOVE / HOLD.
- `content-family-board.csv`, `collection-editorial-copy-board.csv`, `category-editorial-copy-board.csv`.
- `editorial-quality.json`, `editorial-report.md` - before/after metrics, repetition report, examples.
- `apply/editorial-copy-packet.json` + `.sha256` - the only importer input.
- `owner-copy-review.md` - before / final examples and the HOLD list for owner copy approval.
- `owner-final-decision.md` - short owner gate: 12 full descriptions and the 4 resolved content
  decisions (al-95-1, ox-14-1, bri-95-3, te-55-1 / painting_name policy). Hand-written, not generated.
- `data-fix/te-55-1-painting-data-fix.json` - prepared, not applied: the separate data correction
  for te-55-1 (owner decision 4). Not an importer input; it needs its own governed apply.

Style gate (`findStyleIssues` in `apps/backend/src/lib/editorial-copy/quality.ts`): telegraphic
clauses and dashes standing in for a dropped verb, dash overuse, 1-4 word fragments, caption-like
openings and thin texts fail `--strict` and the packet fidelity test.

## Status

`READY_FOR_OWNER_COPY_APPROVAL`. Not applied; production apply needs a separate owner approval.

SEO side (storefront `product-seo.ts`, owned by PR #301 since the owner decisions of 2026-10-11):
a `painting_name` without `motif_slug` gets a buyer name only from the exact EN to RU dictionary
(no transliteration) and is shown as `, «Альбион»` without the word «роспись»; «роспись «…»» stays
reserved for canonical `motif_slug`. Owner policy A with fail-safe exceptions: pages whose painting
data the catalog contradicts (`PAINTING_PRESENTATION_SUPPRESSED` in backend `motif-theme.ts`:
`bri-95-3`, `te-55-1`) show no painting. A Latin legacy subtitle no longer replaces a Latin-free
first sentence in the meta description.

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

None. Both former holds were resolved by the owner on 2026-10-11 and are in the packet:

- `ox-14-1` (decision B) - the page sells the Oxford-1 lower bed alone (price row 29 000 ₽,
  height 257 mm); family `oxford-lower-bed`. Its buyer title and category come from PR #301.
- `al-95-1` (decision A) - text only from what its photo shows, without the painting and the
  convertible mechanism; family `ww-convertible-bed-panel`.

`pr-06-1` (earlier hold: published after the first snapshot) is in the packet.

The snapshot was refreshed on 2026-10-11 (read-only GET): descriptions, titles and statuses match
the earlier snapshot; buyer titles follow PR #301 and 5 category values follow production.
