# План ускорения каталога и фото (post A–F/E)

**Статус:** active  
**Дата:** 2026-07-12  
**Репозиторий:** `/Users/leonidmbp/Documents/projects/furniture-commerce`  
**Основание:** Codex perf advisory + wave-2 handoff + Codex roadmap (2026-07-12)  
**Предыдущий план:** `docs/ai/CATALOG_LOAD_OPTIMIZATION_PLAN.md` (фазы 0–F/E закрыты; D skipped)  
**PR:** https://github.com/saintgroovie/furniture-commerce/pull/15 (смешан с Willie - hygiene: later split)

## 1. Цель

Снизить cold load `/catalog` и `/kids/catalog` и стоимость фото/swatches **без** потери:

- id-set / kids exclusivity / BESPOKE fail-closed  
- self-excluding facets  
- качества hero / execution swatches (не вырезать UX ради скорости)

Medusa SoT. Thin storefront. Нет BFF. Cart `no-store`. Lean RoomSet только opt-in.

## 2. Статус волн

```text
DONE  G0 baseline
DONE  G1 catalog-products path (denylist → superseded by G2)
DONE  H1 swatch/probe IO-gate
DONE  H2 first-card LCP priority
DONE  G2 allowlist browse DTO (~640KB → ~399KB)
DONE  H4 Sharp card WebP + env-gate (local; CDN later)
DONE  W3a–W3d evidence + commit `c8eaccc`
--- wave 3 Next (Codex chose) --- NOW
W3g  Initial media DOM reduction (hero-only until IO/hover) ← measured; img reqs flat; DOM extras deferred
--- After W3g ---
W3e  Compact typed browse view model   OR
W3f  Progressive card activation
W3h  CDN for derivatives (after local levers + deploy path)
--- Later / measured ---
J    Cache + publish invalidation
G3   Batch RoomSet (N>0)
```

**Прогресс:** Wave 3 Now `c8eaccc`. W3g measured (`tmp/catalog-perf/w3g-media-dom-comparison.md`): img requests flat; below-fold extras deferred. Prod H4 flag still off until deploy+coverage. Push/PR on operator ask.

## 3. Wave 3 - Now (обязательный порядок)

### W3a - Production-build baseline (flag 0/1)

**Сделать**

- `yarn build` + `yarn start` storefront `:3002` (не `next dev`)  
- ≥3 cold runs `/catalog` и `/kids/catalog` при `NEXT_PUBLIC_CATALOG_CARD_DERIVATIVES=0` и `=1`  
- Зафиксировать отдельно: document TTFB, Medusa `/store/catalog-products` ms/bytes, HTML bytes, LCP candidate URL/bytes (sample), `<img>` count, cards 107/38  

**DoD:** `tmp/catalog-perf/w3a-prod-baseline.md` + JSON  
**Codex:** recommended  

### W3b - H4 coverage / deploy gate

**Сделать**

- Manifest: каждый ожидаемый card-hero derivative → exists on disk + HTTP 200  
- Script gate fails if missing required derivatives  
- Release note: generate before enabling flag in prod  

**DoD:** `tmp/catalog-perf/h4-coverage-manifest.json` + exit 0 gate  
**Codex:** обязателен перед prod flag  

### W3c - Projected Medusa query

**Сделать**

- `/store/catalog-products` loads **browse field set only** (no `*` / no unused relations)  
- Projection allowlist remains; default `/store/products` unchanged  
- Equality: id-set, facets, cards 107/38  

**DoD:** measurable server-side improvement or documented “no win / keep lean fields”  
**Codex:** обязателен (Store API)  

### W3d - Hero path coverage

**Сделать**

- Collect real initial hero URLs for catalog/kids cards (incl. execution/matrix where SSR-initial)  
- Every eligible static hero has derivative **or** explicit non-derivable class  

**DoD:** coverage report; no silent miss for thumbnail→card path  
**Codex:** recommended  

## 4. Wave 3 - Next

**Codex choice (2026-07-12):** **W3g** - Initial media DOM reduction.

Why: LCP transfer already won; remaining cost looks like media-request contention, not HTML size.

**First step:** catalog cards mount only hero `<img>` initially; swatches/thumbs wait for near-viewport IO or pointer enter (reuse `cardStripProbeEnabled`).

**Stop if:** below-fold DOM extras are **not** deferred after hydration; kids/card fidelity/no-JS regress; or first-card LCP candidate URL leaves the W3a flag1 derivative hero (see `tmp/catalog-perf/w3a-prod-baseline-flag-1.md` / `w3g-lcp-after.md`).

**Measured (flag1):** settled image requests flat (55→55) - strip probes already limited thumbs; client execution controls ≈ above-fold only (5 on /catalog) while SSR keeps ~48 for no-JS.

Then optionally W3e / W3f; then **W3h CDN** after deploy+coverage for H4 flag.

## 5. Later / only if measured

- Batch RoomSet membership (N>0)  
- Catalog read cache **только** с publish invalidation  
- Pagination / virtualize  

## 6. Do not do now

- H4 flag in prod without generate+deploy+coverage  
- Cache without invalidation  
- Batch RoomSet at N=0  
- Blind `next/image`  
- Pagination before local levers exhausted  
- BFF / GraphQL  
- Cutting execution swatches for metrics  

## 7. Инварианты / Stop if

| Stop if | Действие |
|---------|----------|
| Kids leak / fail-open | откат фазы |
| Facet / id-set inequality | откат |
| Broken card heroes (404 derivatives) | flag off / rollback |
| Default PDP / RoomSet detail сломан | откат |
| Servers down for required measure | blocked |

## 8. Git

Dirty tree: только scoped pathspecs. Нет `git add -A`. Commit/push только по запросу оператора.  
PR hygiene: catalog-perf предпочтительно отделить от Willie PR #15 (отдельная задача).
