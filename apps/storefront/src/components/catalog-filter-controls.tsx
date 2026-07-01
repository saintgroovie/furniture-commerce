"use client"

import Link from "next/link"
import { useRouter } from "next/navigation"
import type { ReactNode } from "react"
import { useCallback, useEffect, useState, useTransition } from "react"
import {
  buildCatalogHref,
} from "@/lib/catalog-filter-params"
import {
  type CatalogFacets,
  type CatalogFilterState,
  PRODUCT_TYPE_FILTER_LABELS,
  getCategoryFilterLabel,
  getCollectionFilterLabel,
  hasActiveCatalogFilters,
} from "@/lib/catalog-filters"

type Props = {
  basePath: string
  state: CatalogFilterState
  facets: CatalogFacets
  resultCount: number
  showBespokeCta?: boolean
  children: ReactNode
}

function toggleMulti(values: string[], value: string): string[] {
  const v = value.toLowerCase()
  return values.includes(v) ? values.filter((x) => x !== v) : [...values, v]
}

export function CatalogFilterControls({
  basePath,
  state,
  facets,
  resultCount,
  showBespokeCta = false,
  children,
}: Props) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [mobileOpen, setMobileOpen] = useState(false)
  const [searchDraft, setSearchDraft] = useState(state.q ?? "")

  useEffect(() => {
    setSearchDraft(state.q ?? "")
  }, [state.q])

  const navigate = useCallback(
    (next: CatalogFilterState) => {
      const href = buildCatalogHref(basePath, next)
      startTransition(() => {
        router.push(href)
      })
    },
    [basePath, router]
  )

  const submitSearch = () => {
    const q = searchDraft.trim() || undefined
    navigate({ ...state, q })
  }

  const active = hasActiveCatalogFilters(state)
  const hasBespokeTab = showBespokeCta

  const filterPanel = (
    <div className="catalog-filter-panel">
      <div className="catalog-filter-panel-head">
        <h2>Фильтры</h2>
        {active && (
          <Link
            href={basePath}
            className="catalog-filter-panel-reset"
            scroll={false}
            onClick={() => setSearchDraft("")}
          >
            Сбросить
          </Link>
        )}
      </div>

      {facets.categories.length > 0 && (
        <fieldset className="catalog-filter-group">
          <legend>Категория</legend>
          <div className="catalog-filter-checks">
            <Link
              href={buildCatalogHref(basePath, { ...state, category: [] })}
              className={
                state.category.length === 0
                  ? "catalog-filter-option catalog-filter-option-active"
                  : "catalog-filter-option"
              }
              scroll={false}
              aria-pressed={state.category.length === 0}
            >
              <span>Все</span>
              <span className="catalog-filter-count">
                {facets.categories.reduce((sum, opt) => sum + opt.count, 0)}
              </span>
            </Link>
            {facets.categories.map((opt) => {
              const active = state.category.includes(opt.value)
              return (
                <Link
                  key={opt.value}
                  href={buildCatalogHref(basePath, {
                    ...state,
                    category: toggleMulti(state.category, opt.value),
                  })}
                  className={
                    active
                      ? "catalog-filter-option catalog-filter-option-active"
                      : "catalog-filter-option"
                  }
                  scroll={false}
                  aria-pressed={active}
                >
                  <span>{opt.label}</span>
                  <span className="catalog-filter-count">{opt.count}</span>
                </Link>
              )
            })}
          </div>
        </fieldset>
      )}

      {facets.collections.length > 0 && (
        <fieldset className="catalog-filter-group">
          <legend>Коллекция</legend>
          <div className="catalog-filter-checks">
            <Link
              href={buildCatalogHref(basePath, { ...state, collection: [] })}
              className={
                state.collection.length === 0
                  ? "catalog-filter-option catalog-filter-option-active"
                  : "catalog-filter-option"
              }
              scroll={false}
              aria-pressed={state.collection.length === 0}
            >
              <span>Все</span>
              <span className="catalog-filter-count">
                {facets.collections.reduce((sum, opt) => sum + opt.count, 0)}
              </span>
            </Link>
            {facets.collections.map((opt) => {
              const active = state.collection.includes(opt.value)
              return (
                <Link
                  key={opt.value}
                  href={buildCatalogHref(basePath, {
                    ...state,
                    collection: toggleMulti(state.collection, opt.value),
                  })}
                  className={
                    active
                      ? "catalog-filter-option catalog-filter-option-active"
                      : "catalog-filter-option"
                  }
                  scroll={false}
                  aria-pressed={active}
                >
                  <span>{opt.label}</span>
                  <span className="catalog-filter-count">{opt.count}</span>
                </Link>
              )
            })}
          </div>
        </fieldset>
      )}

      <fieldset className="catalog-filter-group">
        <legend>Цена</legend>
        <div className="catalog-filter-price">
          <label>
            <span>от</span>
            <input
              type="number"
              inputMode="numeric"
              placeholder="от"
              min={0}
              defaultValue={state.priceMin ?? ""}
              key={`min-${state.priceMin ?? "x"}`}
              onBlur={(e) => {
                const raw = e.target.value.trim()
                const priceMin = raw ? Number.parseInt(raw, 10) : undefined
                if (raw && !Number.isFinite(priceMin)) return
                navigate({
                  ...state,
                  priceMin: priceMin != null && priceMin >= 0 ? priceMin : undefined,
                })
              }}
            />
          </label>
          <span aria-hidden>—</span>
          <label>
            <span>до</span>
            <input
              type="number"
              inputMode="numeric"
              placeholder="до"
              min={0}
              defaultValue={state.priceMax ?? ""}
              key={`max-${state.priceMax ?? "x"}`}
              onBlur={(e) => {
                const raw = e.target.value.trim()
                const priceMax = raw ? Number.parseInt(raw, 10) : undefined
                if (raw && !Number.isFinite(priceMax)) return
                navigate({
                  ...state,
                  priceMax: priceMax != null && priceMax >= 0 ? priceMax : undefined,
                })
              }}
            />
          </label>
        </div>
        {facets.priceRange && (
          <p className="catalog-filter-price-hint">
            {facets.priceRange.min.toLocaleString("ru-RU")}–
            {facets.priceRange.max.toLocaleString("ru-RU")} ₽
          </p>
        )}
      </fieldset>

      {active && (
        <Link
          href={basePath}
          className="catalog-filter-sidebar-clear"
          scroll={false}
          onClick={() => setSearchDraft("")}
        >
          Сбросить фильтры
        </Link>
      )}
    </div>
  )

  return (
    <div className="catalog-filter-shell" data-pending={isPending ? "true" : undefined}>
      <div className="catalog-controls">
        <nav className="filter-tabs" aria-label="Тип товара">
          <Link
            href={buildCatalogHref(basePath, { ...state, type: undefined })}
            className={!state.type ? "filter-tab filter-tab-active" : "filter-tab"}
            scroll={false}
          >
            Все
          </Link>
          {facets.types.map((opt) => {
            const nextType =
              state.type === opt.value
                ? undefined
                : (opt.value as CatalogFilterState["type"])
            return (
              <Link
                key={opt.value}
                href={buildCatalogHref(basePath, { ...state, type: nextType })}
                className={
                  state.type === opt.value
                    ? "filter-tab filter-tab-active"
                    : "filter-tab"
                }
                scroll={false}
              >
                {PRODUCT_TYPE_FILTER_LABELS[opt.value] ?? opt.label}
              </Link>
            )
          })}
          {hasBespokeTab && (
            <Link href="/bespoke" className="filter-tab" scroll={false}>
              По проекту
            </Link>
          )}
        </nav>
      </div>

      <div className="catalog-filter-toolbar">
        <form
          className="catalog-search"
          action={basePath}
          method="get"
          onSubmit={(e) => {
            e.preventDefault()
            submitSearch()
          }}
        >
          {state.type && <input type="hidden" name="type" value={state.type} />}
          {state.category.length > 0 && (
            <input type="hidden" name="category" value={state.category.join(",")} />
          )}
          {state.collection.length > 0 && (
            <input type="hidden" name="collection" value={state.collection.join(",")} />
          )}
          {state.priceMin != null && (
            <input type="hidden" name="price_min" value={String(state.priceMin)} />
          )}
          {state.priceMax != null && (
            <input type="hidden" name="price_max" value={String(state.priceMax)} />
          )}
          {state.sort && <input type="hidden" name="sort" value={state.sort} />}
          <label className="sr-only" htmlFor="catalog-search-input">
            Поиск по каталогу
          </label>
          <input
            id="catalog-search-input"
            name="q"
            type="search"
            value={searchDraft}
            onChange={(e) => setSearchDraft(e.target.value)}
            placeholder="Поиск по названию, коллекции или категории"
            autoComplete="off"
          />
          <button type="submit" className="catalog-search-btn">
            Найти
          </button>
        </form>

        <div className="catalog-filter-toolbar-actions">
          <label className="catalog-sort">
            <span>Сортировка</span>
            <select
              value={state.sort ?? "default"}
              onChange={(e) => {
                const v = e.target.value
                navigate({
                  ...state,
                  sort:
                    v === "price_asc" || v === "price_desc" ? v : undefined,
                })
              }}
            >
              <option value="default">По умолчанию</option>
              <option value="price_asc">Цена: по возрастанию</option>
              <option value="price_desc">Цена: по убыванию</option>
            </select>
          </label>

          <button
            type="button"
            className="catalog-filter-mobile-toggle"
            aria-expanded={mobileOpen}
            onClick={() => setMobileOpen((v) => !v)}
          >
            Фильтры
          </button>
        </div>
      </div>

      <div className="catalog-filter-meta">
        <p className="catalog-result-count">
          Найдено {resultCount}
        </p>
        {active && (
          <Link
            href={basePath}
            className="catalog-clear-filters"
            scroll={false}
            onClick={() => setSearchDraft("")}
          >
            Сбросить всё
          </Link>
        )}
      </div>

      <div className="catalog-active-chips" aria-label="Активные фильтры">
        <span className="catalog-active-chips-label">Активные фильтры:</span>
        {!active && <span className="catalog-active-empty">Все товары</span>}
        {state.q && (
          <ActiveChip
            label={`«${state.q}»`}
            removeHref={buildCatalogHref(basePath, { ...state, q: undefined })}
          />
        )}
        {state.type && (
          <ActiveChip
            label={PRODUCT_TYPE_FILTER_LABELS[state.type] ?? state.type}
            removeHref={buildCatalogHref(basePath, { ...state, type: undefined })}
          />
        )}
        {state.category.map((c) => {
          const label =
            facets.categories.find((f) => f.value === c)?.label ??
            getCategoryFilterLabel(c)
          return (
            <ActiveChip
              key={`cat-${c}`}
              label={label}
              removeHref={buildCatalogHref(basePath, {
                ...state,
                category: state.category.filter((x) => x !== c),
              })}
            />
          )
        })}
        {state.collection.map((c) => {
          const label =
            facets.collections.find((f) => f.value === c)?.label ??
            getCollectionFilterLabel(c)
          return (
            <ActiveChip
              key={`col-${c}`}
              label={label}
              removeHref={buildCatalogHref(basePath, {
                ...state,
                collection: state.collection.filter((x) => x !== c),
              })}
            />
          )
        })}
        {(state.priceMin != null || state.priceMax != null) && (
          <ActiveChip
            label={formatPriceChip(state.priceMin, state.priceMax)}
            removeHref={buildCatalogHref(basePath, {
              ...state,
              priceMin: undefined,
              priceMax: undefined,
            })}
          />
        )}
      </div>

      <div className="catalog-filter-layout">
        <aside
          className={`catalog-filter-sidebar ${mobileOpen ? "catalog-filter-sidebar-open" : ""}`}
          aria-label="Фильтры каталога"
        >
          {filterPanel}
          <button
            type="button"
            className="catalog-filter-apply-mobile"
            onClick={() => setMobileOpen(false)}
          >
            Показать
          </button>
        </aside>
        <div className="catalog-product-area">{children}</div>
      </div>
    </div>
  )
}

function ActiveChip({
  label,
  removeHref,
}: {
  label: string
  removeHref: string
}) {
  return (
    <span className="catalog-active-chip">
      {label}
      <Link href={removeHref} scroll={false} aria-label={`Убрать фильтр ${label}`}>
        ×
      </Link>
    </span>
  )
}

function formatPriceChip(min?: number, max?: number): string {
  if (min != null && max != null) return `${min.toLocaleString("ru-RU")}–${max.toLocaleString("ru-RU")} ₽`
  if (min != null) return `от ${min.toLocaleString("ru-RU")} ₽`
  if (max != null)   return `до ${max.toLocaleString("ru-RU")} ₽`
  return "Цена"
}
