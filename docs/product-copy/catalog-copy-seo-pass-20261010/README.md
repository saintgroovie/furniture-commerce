# Catalog copy + SEO pass (2026-10-10)

Scope: buyer names, product SEO head, description hygiene, static page titles, catalog structured data.
Production data was **not** written. Everything marked APPLY is rendered by storefront code from existing data.

## Files

| File | What |
|---|---|
| `content-board.csv` | 214 published products: current/proposed title, description, SEO title, meta, evidence, confidence, action |
| `content-board.summary.json` | Board counts |
| `seo-audit-board.before.csv` | Production crawl (239 URLs from `sitemap.xml`) before this pass |
| `seo-audit-board.before.summary.json` | Before counts |
| `seo-audit-board.after.csv` | Same URL list against the branch preview (`next start` on a read-only GET proxy to the production Store API) |
| `seo-audit-board.after.summary.json` | After counts |

Regenerate (read-only):

```sh
cd apps/storefront
yarn dlx -q tsx scripts/catalog-content-board.ts --products <store-products.json> --browse <catalog-browse.json> \
  --unresolved ../../docs/product-copy/product-copy-unresolved.csv --out ../../docs/product-copy/catalog-copy-seo-pass-20261010
yarn dlx -q tsx scripts/catalog-seo-regression.ts --products <store-products.json> --strict
yarn dlx -q tsx scripts/seo-audit-crawl.ts --base https://woodright.ru --out <dir>
```

## Buyer name rules (`buyer-title-phrasing.ts`)

Formula: `<тип товара> <модель> (<размер / уточнение>) <отличие>`.

- Abbreviations from the price list become words: `1-сп.` → «Односпальная», `1,5-сп.` → «Полутораспальная», `2-дв` → «Двухдверный», `1-тумб.` → «Однотумбовый».
- Adjective goes first: «Комод высокий» → «Высокий комод», «Тумбочка прикроватная» → «Прикроватная тумба».
- Model = collection name in Cyrillic when the title has none (Оливер, Прованс, Кантри, Гринвич, Мончелси, Принцесса Роза, Вилли Винки, Оксфорд). Greenwich model nicknames (Левел, Скейл…) already name the model.
- Desk pedestal codes: two-pedestal map (verified earlier) + single-pedestal `Я0 / 0Я / П0 / 0П` from `pedestal_filling` (pv-65-5…8, co-65-1/2).
- Closed dictionary only. Unknown head or unknown code stays verbatim (Monchelsea `модуль/Ш`, `модуль/ЯШ`, `модуль/П+ЯШ+Ш`).
- No SKU, colour, price, brand or epithets in the name. Owner `metadata.public_title` is never rephrased; it keeps the earlier contract (pedestal code expansion, hinge-side strip, `*` → `×`) and a bare `90×190` in it is left as typed.
- Dictionary rules match whole tokens only: «Кровать 1-спальная» is not read as `1-сп.`.
- Willie Winkie: H1 is the piece («Высокий комод Вилли Винки»); `<title>`, og:title and Product JSON-LD add the painting («…, роспись «Феи»»), so 27 one-painting pages no longer share one title.

## SEO head (`product-seo.ts`, `page-title.ts`)

- Meta description: whole leading sentences of the buyer description ≤160 → subtitle → word-boundary cut with «…» → factual fallback from the entity name. No ASCII «...», no promises (availability, delivery, discounts, terms).
- Description hygiene: price-list provenance lines, a title echo and a bare size line are hidden on the PDP; the shared note «Есть варианты исполнения - уточним в заявке» stays on the PDP and is dropped from meta / JSON-LD.
- JSON-LD Product: name = SEO entity, description = sanitized text. Offer rule unchanged (one uniform RUB price only). No ratings, reviews or availability.
- Static pages whose title already names Woodright are emitted as `absolute` (no «… Woodright | Woodright»).
- Legal meta descriptions: lead lines joined as sentences.
- Catalog ItemList JSON-LD and card / chip links point at the canonical `/product/<handle>` (was `/product/<id>`), with the buyer name instead of the raw title.
- PDP: the raw price-list `canonical_name` line under H1 is removed (47 production pages showed strings like «Кровать 2-сп. (160*200) с подъемн.мех-змом»).
- PDP description typography: hyphens inside words are no longer turned into « - » («светло-серой», «90-сантиметровом»; 36 descriptions + 12 subtitles affected in production).

## SEO before / after (same 239 URLs)

| Check | Before (production) | After (branch preview) |
|---|---|---|
| Duplicate title groups / pages | 36 / 111 | 0 / 0 |
| Duplicate meta groups / pages | 1 / 8 | 0 / 0 |
| Meta with ASCII «...» | 168 | 0 |
| Doubled brand in title | 12 | 0 |
| H1 ≠ 1 | 0 | 0 |
| Product pages with Offer | 198 | 198 |
| Title > 70 chars | 6 | 30 |

Title length grew because names now spell out type, model and the distinguishing part. The distinguishing part is never cut; the brand tail is last, so a SERP cut drops the brand first. Preview pages are `noindex` by design (demo mode); production indexing policy is unchanged.

## Redirect / canonical plan

No product URL changes: handles and routes are untouched, so no 301 is needed. Internal links move from `/product/<id>` to the already canonical `/product/<handle>`; the id route keeps working. Collection / category landing URLs are not introduced (HOLD below).

## Collection copy drafts (HOLD - no surface yet)

Facts only, from catalog data. Kept for a future collection landing; not rendered.

| Collection | Lead | Supporting |
|---|---|---|
| Оливер | Спальня, гостиная, столовая и кабинет в одной линии | Кровати 5 размеров, шкафы, комоды, столы и полки |
| Оливер · детская | Кроватки, кровать-трансформер и бортики | Пеленальная столешница и каркас для балдахина |
| Прованс | Кровати, шкафы, комоды и письменные столы | Кровати 5 размеров, этажерки, банкетки и зеркала |
| Кантри | Шкафы, стеллажи и письменные столы | Кровати с подъёмным механизмом |
| Гринвич | Кровати с мягким изголовьем 5 размеров | Гардеробы, комоды, тумбы и рабочий стол |
| Мончелси | Шкафы, комоды, кровати и столы | Модульные полки и угловая секция |
| Принцесса Роза | Кровати, письменные столы, шкафы и этажерки | Часть моделей - с рисунком и ручками Сваровски |
| Вилли Винки | Комоды, стеллажи, столы и шкафы с ручной росписью | Каждая роспись - свой набор мебели |
| Оксфорд | HOLD: коллекция на паузе, данные interim | - |

## Category intros (HOLD - no surface yet)

| Category | Intro |
|---|---|
| Кровати | Односпальные, полутораспальные и двуспальные кровати в 7 коллекциях, детские кроватки и кровать-трансформер |
| Столы | Письменные, рабочие, обеденные и детские столы |
| Шкафы | Шкафы для одежды, книжные шкафы, витрины и гардеробы |
| Комоды | Стандартные, широкие и высокие комоды, детские - с росписью |
| Стеллажи | Стеллажи для книг: узкие, широкие и высокие |
| Тумбы | Прикроватные тумбы и тумбы для телевизора |
| Полки | Навесные и книжные полки, 1-3 яруса |
| Зеркала | Навесные, напольные и настольные зеркала |

## HOLD (nothing written)

| Item | Why |
|---|---|
| Willie Winkie painting pages: canonical consolidation | One product per painting is current architecture; changing URLs / canonicals is an owner decision |
| Collection / category landing routes | New indexable URLs need IA + owner approval |
| Shared note in 156 descriptions | Owner text from the copy pass; recommend rendering it once in UI instead of in every description |
| 58 MNM / PR products without buyer description | Only price-list lines or empty; facts pack in `content-board.csv` → owner copy |
| Monchelsea module codes | `модуль/Ш`, `модуль/ЯШ`, `модуль/П+ЯШ+Ш` meaning not confirmed |
| ol-08-1, ol-08-1-mirror, s-ox-05 | Already in `product-copy-unresolved.csv` (identity conflict / missing data) |
| Latin collection names inside description prose | H1 is Cyrillic; rewriting owner prose needs approval |
| Filter label «Скамейки» | Items are банкетки; taxonomy label change is a product decision |
| Size-split products as variants | Changes URL and data semantics |
| Willie Winkie painting chip labels overlap on desktop | Pre-existing layout issue, separate UI task |
