# План ускорения каталога и фото (post A–F/E)

**Статус:** active
**Дата:** 2026-07-12
**Репозиторий:** `/Users/leonidmbp/Documents/projects/furniture-commerce`
**Основание:** Codex perf advisory (`approve-with-notes`) после пакета 0→A→C→B→F→E
**Предыдущий план:** `docs/ai/CATALOG_LOAD_OPTIMIZATION_PLAN.md` (фазы 0–F/E закрыты; D skipped)

## 1. Цель

Снизить cold load `/catalog` и `/kids/catalog` и стоимость фото/swatches **без** потери:

- id-set / kids exclusivity / BESPOKE fail-closed
- self-excluding facets
- качества hero / execution swatches (не вырезать UX ради скорости)

Medusa SoT. Thin storefront. Нет BFF. Cart `no-store`. Lean RoomSet только opt-in.

## 2. Порядок работ (Codex gate на каждой фазе)

```text
G0  Measure post-package baseline          → Codex
G1  PERF-02 Fixed catalog listing DTO      → Codex (обязателен, Store API)
H1  PERF-04 + PERF-06 Swatch IO-gate +
    card photo budget (card-only)          → Codex
H2  PERF-08 LCP hero priority (если не
    вошло в H1)                            → Codex recommended
--- stop / operator decide ---
G2  PERF-03 Slim browse DTO for client     → later
H4  PERF-07 Derivatives + CDN              → infra, later
J   PERF-11 Cache TTL                      → только после invalidation
G3  PERF-10 Batch RoomSet ids              → когда N>0 измерен
```

**Этот прогон:** `G0 → G1 → H1` (+ H2 если маленький diff).

**Прогресс (2026-07-12):**
- G0: done + Codex `safe_to_proceed_G1`
- G1: `/store/catalog-products` live OK (−~107KB / −17%); smoke 107/38; Codex `safe_to_adopt_G1`
- H1 + H2: swatch IO-gate + `priorityHero` first card; Codex `safe_to_proceed_next` / package `safe_to_adopt`
- Stop line reached - next only by operator decide (G2 / H4 / J / G3)

## 3. Фазы

### G0 - Baseline (только tmp artifacts)

**Сделать**

- 3 cold + warm прогона: `/catalog`, `/kids/catalog` (TTFB / total / HTML bytes)
- `/store/products` size + field-level byte breakdown (`metadata` / `images` / `variants` / other)
- Из HTML: число `<img>`, unique src, оценка (HEAD sample)
- Зафиксировать: cards 107 / 38, id-set equality vs phase-a baselines

**DoD:** `tmp/catalog-perf/g0-post-package-baseline.md` + JSON
**Stop if:** store list неполный (≠157) или servers down

### G1 - PERF-02 Fixed listing projection

**Сделать**

- Opt-in Store API path `/store/catalog-products` with **fixed** metadata projection for listing/filters/cards
  (not `?view=` on `/store/products` - Medusa core rejects unrecognized query fields)
- Default `/store/products` unchanged
- Storefront catalog pages use `getCatalogProducts()`
- Equality: main/kids id-sets, facet snapshots, fixtures

**Вне scope:** browse slim DTO (G2), cache, pagination

**Codex:** обязателен

### H1 - PERF-04 + PERF-06 Photo / swatch

**Сделать**

- Viewport/intent gate для `useSwatchColors` sampling (card)
- Metadata `swatchHex` остаётся мгновенным fast path
- Card extras: stricter budget (initial 0 beyond hero until near-viewport / hover; cap probes)
- PDP не трогать

**DoD:** меньше early image+canvas; visual fixtures OK; no unverified flash

**Codex:** обязателен

### H2 - PERF-08 (optional same PR as H1 if tiny)

- First above-fold card hero: `fetchPriority` / not lazy; others stay lazy

## 4. Инварианты / Stop if

| Stop if | Действие |
|---------|----------|
| Kids leak / fail-open | откат фазы |
| Facet / id-set inequality | откат |
| Swatches исчезли / broken flash | откат H1 |
| Default RoomSet/PDP detail сломан | откат |
| Нет G0 evidence | не стартовать G1 |

## 5. Out of scope сейчас

- Phase D cache без invalidation
- `next/image` без CDN/derivatives
- Pagination / virtualize
- BFF / GraphQL
- Materialized kids ids
- Batch RoomSet при N=0

## 6. Git

Dirty tree: только scoped pathspecs. Нет `git add -A`. Commit только по запросу оператора.
