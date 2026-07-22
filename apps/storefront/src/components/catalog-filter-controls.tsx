"use client"

import Link from "next/link"
import { useRouter } from "next/navigation"
import type { KeyboardEvent, ReactNode } from "react"
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  useTransition,
} from "react"
import {
  buildCatalogHref,
} from "@/lib/catalog-filter-params"
import { CatalogSortDropdown } from "@/components/catalog-sort-dropdown"
import { isUnmodifiedPrimaryClick } from "@/lib/client/is-unmodified-primary-click"
import {
  type CatalogFacets,
  type CatalogFilterState,
  PRODUCT_TYPE_FILTER_LABELS,
  getCategoryFilterLabel,
  getCollectionFilterLabel,
  hasActiveCatalogFilters,
} from "@/lib/catalog-filters"
import { useCspNonce } from "@/lib/csp-nonce"
import { a11yCopy } from "@/lib/woodright-copy"

type Props = {
  basePath: string
  state: CatalogFilterState
  facets: CatalogFacets
  resultCount: number
  showBespokeCta?: boolean
  /**
   * When set, filter changes stay on the client (history.pushState + local
   * recompute). App Router does not refetch the page / Medusa.
   */
  onClientNavigate?: (next: CatalogFilterState) => void
  children: ReactNode
}

function toggleMulti(values: string[], value: string): string[] {
  const v = value.toLowerCase()
  return values.includes(v) ? values.filter((x) => x !== v) : [...values, v]
}

type PillBox = { left: number; top: number; width: number; height: number }

const CATALOG_FILTER_SIDEBAR_ID = "catalog-filter-sidebar"

function tabBox(tab: HTMLElement): PillBox {
  return {
    left: Math.round(tab.offsetLeft),
    top: Math.round(tab.offsetTop),
    width: Math.round(tab.offsetWidth),
    height: Math.round(tab.offsetHeight),
  }
}

/* Active indicator + hover ghost share one layout helper: a single rounded
   rect (not 3-part caps). Cap/mid seams and scaleX made the tip arc drift
   off the track's concentric radius; one border-radius matches the track
   math exactly (outer R = pill R + pad + border). Width transition is OK
   here — optimistic pendingType starts the glide before the grid re-render. */
function layoutPillBox(el: HTMLElement, box: PillBox) {
  el.style.transform = `translate3d(${box.left}px, ${box.top}px, 0)`
  el.style.width = `${box.width}px`
  el.style.height = `${box.height}px`
}

/* Pre-hydration bootstrap for --catalog-filter-fit (see the sidebar effect
   below for what the value means). Served inline inside the sidebar's SSR
   HTML, so the browser runs it while parsing — the filter card gets its
   correct height on the very first paint instead of waiting for React to
   hydrate (noticeably long on reload, especially in dev).
   Re-measures every animation frame rather than once: a single parse-time
   measurement is unreliable (stylesheets may not be applied yet — in dev
   Next injects global CSS from a JS chunk — and the browser may restore
   the scroll position later), which previously produced a wrong height
   that stuck until hydration. The loop also covers scroll/resize for
   free, costs one getBoundingClientRect per frame, and self-terminates
   once the hydrated effect marks the sidebar with data-fit-owner="react".
   Must stay logic-identical to the effect's update(). */
const FILTER_FIT_BOOTSTRAP = `(() => {
  const sidebar = document.currentScript && document.currentScript.closest(".catalog-filter-sidebar");
  if (!sidebar) return;
  const panel = sidebar.querySelector(".catalog-filter-panel");
  if (!panel) return;
  const tick = () => {
    if (sidebar.dataset.fitOwner === "react" || !sidebar.isConnected) return;
    const panelStyle = getComputedStyle(panel);
    const stickyStyle = panelStyle.position === "sticky" ? panelStyle : getComputedStyle(sidebar);
    const top = Math.max(sidebar.getBoundingClientRect().top, parseFloat(stickyStyle.top) || 0);
    sidebar.style.setProperty("--catalog-filter-fit", innerHeight - top - 24 + "px");
    requestAnimationFrame(tick);
  };
  tick();
})()`

export function CatalogFilterControls({
  basePath,
  state,
  facets,
  resultCount,
  showBespokeCta = false,
  onClientNavigate,
  children,
}: Props) {
  const router = useRouter()
  const cspNonce = useCspNonce()
  const [isPending, startTransition] = useTransition()
  const [mobileOpen, setMobileOpen] = useState(false)
  const [searchDraft, setSearchDraft] = useState(state.q ?? "")
  const filterToggleRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    setSearchDraft(state.q ?? "")
  }, [state.q])

  /* Sliding pill behind the segmented tabs: instead of the dark background
     snapping from one tab to another on navigation, a single absolutely
     positioned indicator glides to the newly active tab. Measured from the
     real DOM (offsetLeft/offsetWidth) so it survives wrapping on mobile and
     любые label widths. The indicator element persists across re-renders, so
     style changes animate via CSS transition; its very first mount paints
     directly in place (no fly-in from 0,0). */
  const tabsRef = useRef<HTMLElement>(null)
  const [tabIndicator, setTabIndicator] = useState<{
    left: number
    top: number
    width: number
    height: number
  } | null>(null)

  const measureTabIndicator = useCallback(() => {
    const nav = tabsRef.current
    const activeTab = nav?.querySelector<HTMLElement>(".filter-tab-active")
    if (!nav || !activeTab) {
      setTabIndicator(null)
      return
    }
    setTabIndicator(tabBox(activeTab))
  }, [])

  /* Hover ghost: single rounded element, styles written imperatively —
     zero React re-renders on hover. Single piece (not 3-part) so the
     accent gradient never shows a cap/mid seam at the tip. On leave it
     fades out in place; on re-enter it snaps under the cursor
     (data-instant) then fades in — no stale glide across the track. */
  const ghostRef = useRef<HTMLSpanElement>(null)

  const onTabsPointerOver = useCallback((e: { target: EventTarget }) => {
    const nav = tabsRef.current
    const ghost = ghostRef.current
    if (!nav || !ghost || !(e.target instanceof Element)) return
    const tab = e.target.closest<HTMLElement>(".filter-tab")
    if (!tab || !nav.contains(tab)) return
    // Active tab already has the dark indicator — hide the ghost so the
    // two layers never fight for the same silhouette.
    if (tab.classList.contains("filter-tab-active")) {
      delete ghost.dataset.shown
      return
    }
    const box = tabBox(tab)
    if (ghost.dataset.shown !== "true") {
      ghost.dataset.instant = "true"
      layoutPillBox(ghost, box)
      void ghost.offsetWidth
      delete ghost.dataset.instant
      ghost.dataset.shown = "true"
    } else {
      layoutPillBox(ghost, box)
    }
  }, [])

  const onTabsPointerLeave = useCallback(() => {
    const ghost = ghostRef.current
    if (ghost) delete ghost.dataset.shown
  }, [])

  /* Drop the ghost on press so the dark indicator takes over alone —
     otherwise both layers sit under the same tab for a beat mid-click. */
  const onTabsPointerDown = useCallback(() => {
    const ghost = ghostRef.current
    if (ghost) delete ghost.dataset.shown
  }, [])

  /* Optimistic active tab: the pill + label colors switch on click, not when
     the route change lands. Without this the glide starts only after the new
     RSC payload arrives and the grid re-renders — exactly when the main
     thread is busiest — so the animation used to begin with a visible lag
     and stutter. `pendingType` mirrors the clicked tab until state.type
     catches up, then resets (see effect below). */
  const [pendingType, setPendingType] = useState<{
    type: CatalogFilterState["type"] | undefined
  } | null>(null)

  useEffect(() => {
    setPendingType(null)
  }, [state.type])

  const activeType = pendingType ? pendingType.type : state.type

  useLayoutEffect(() => {
    measureTabIndicator()
  }, [measureTabIndicator, activeType])

  useEffect(() => {
    const nav = tabsRef.current
    if (!nav) return
    /* Re-measure on container resizes (viewport changes, web-font swap). */
    const observer = new ResizeObserver(measureTabIndicator)
    observer.observe(nav)
    return () => observer.disconnect()
  }, [measureTabIndicator])

  /* The filter card must always end 24px above the viewport bottom (the
     same interval as its side gap) with the price block + «Применить»
     inside — at *every* scroll position. Once the card is stuck that's a
     constant (100vh − sticky top − 24), but before sticking the card sits
     lower in the flow (under the search toolbar on desktop, under the
     «Фильтры» toggle on mobile) and the available height depends on how
     far the page is scrolled. CSS alone can't see that, so we publish the
     current fit as --catalog-filter-fit on the sidebar; the max-height
     rules in globals.css consume it (their calc() fallbacks cover the
     first paint before this runs). The sticky element differs per
     breakpoint — the inner panel on desktop, the sidebar itself on
     mobile — so the sticky top offset is read from whichever is sticky
     rather than hard-coded. 24 mirrors --space-lg. */
  const sidebarRef = useRef<HTMLElement>(null)

  /* Mobile filter drawer: Escape closes and restores focus to the toggle. */
  useEffect(() => {
    if (!mobileOpen) return
    const sidebar = sidebarRef.current
    requestAnimationFrame(() => {
      const first = sidebar?.querySelector<HTMLElement>(
        'a[href], button:not([disabled]), input:not([disabled]), [tabindex]:not([tabindex="-1"])'
      )
      first?.focus()
    })
    function onKeyDown(e: globalThis.KeyboardEvent) {
      if (e.key === "Escape") {
        e.preventDefault()
        setMobileOpen(false)
        requestAnimationFrame(() => filterToggleRef.current?.focus())
      }
    }
    document.addEventListener("keydown", onKeyDown)
    return () => document.removeEventListener("keydown", onKeyDown)
  }, [mobileOpen])

  useEffect(() => {
    const sidebar = sidebarRef.current
    const panel = sidebar?.querySelector<HTMLElement>(".catalog-filter-panel")
    if (!sidebar || !panel) return
    /* Retires the pre-hydration bootstrap's listeners (FILTER_FIT_BOOTSTRAP
       checks this flag) — from here on this effect owns the variable. */
    sidebar.dataset.fitOwner = "react"
    let raf = 0
    const update = () => {
      raf = 0
      const panelStyle = getComputedStyle(panel)
      const stickyStyle =
        panelStyle.position === "sticky" ? panelStyle : getComputedStyle(sidebar)
      const stickyTop = Number.parseFloat(stickyStyle.top) || 0
      const top = Math.max(sidebar.getBoundingClientRect().top, stickyTop)
      sidebar.style.setProperty(
        "--catalog-filter-fit",
        `${window.innerHeight - top - 24}px`
      )
    }
    const schedule = () => {
      if (!raf) raf = requestAnimationFrame(update)
    }
    update()
    window.addEventListener("scroll", schedule, { passive: true })
    window.addEventListener("resize", schedule)
    /* The rail's height tracks the product grid, so this also catches
       layout shifts after filter navigation re-renders the list. */
    const observer = new ResizeObserver(schedule)
    observer.observe(sidebar)
    return () => {
      window.removeEventListener("scroll", schedule)
      window.removeEventListener("resize", schedule)
      observer.disconnect()
      if (raf) cancelAnimationFrame(raf)
    }
  }, [])

  const navigate = useCallback(
    (next: CatalogFilterState) => {
      if (onClientNavigate) {
        startTransition(() => {
          onClientNavigate(next)
        })
        return
      }
      const href = buildCatalogHref(basePath, next)
      startTransition(() => {
        router.push(href)
      })
    },
    [basePath, router, onClientNavigate]
  )

  const onFilterLinkClick = useCallback(
    (
      e: {
        preventDefault: () => void
        button?: number
        metaKey?: boolean
        ctrlKey?: boolean
        shiftKey?: boolean
        altKey?: boolean
      },
      next: CatalogFilterState,
      extra?: () => void
    ) => {
      if (!onClientNavigate) {
        extra?.()
        return
      }
      if (!isUnmodifiedPrimaryClick(e)) return
      e.preventDefault()
      extra?.()
      navigate(next)
    },
    [onClientNavigate, navigate]
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
            onClick={(e) =>
              onFilterLinkClick(e, { category: [], collection: [] }, () =>
                setSearchDraft("")
              )
            }
          >
            Сбросить
          </Link>
        )}
      </div>

      {/* Only this middle block scrolls internally — the head above and the
          price block below (incl. «Применить») stay put, so the button is
          never pushed below the fold by a long collections/type list. */}
      <div className="catalog-filter-scroll">
      {active && (
        <div
          className="catalog-active-chips"
          role="group"
          aria-label={a11yCopy.activeFiltersLabel}
        >
          {state.q && (
            <ActiveChip
              label={`«${state.q}»`}
              removeHref={buildCatalogHref(basePath, { ...state, q: undefined })}
              onRemove={
                onClientNavigate
                  ? () => navigate({ ...state, q: undefined })
                  : undefined
              }
            />
          )}
          {state.type && (
            <ActiveChip
              label={PRODUCT_TYPE_FILTER_LABELS[state.type] ?? state.type}
              removeHref={buildCatalogHref(basePath, { ...state, type: undefined })}
              onRemove={
                onClientNavigate
                  ? () => navigate({ ...state, type: undefined })
                  : undefined
              }
            />
          )}
          {state.category.map((c) => {
            const label =
              facets.categories.find((f) => f.value === c)?.label ??
              getCategoryFilterLabel(c)
            const next = {
              ...state,
              category: state.category.filter((x) => x !== c),
            }
            return (
              <ActiveChip
                key={`cat-${c}`}
                label={label}
                removeHref={buildCatalogHref(basePath, next)}
                onRemove={onClientNavigate ? () => navigate(next) : undefined}
              />
            )
          })}
          {state.collection.map((c) => {
            const label =
              facets.collections.find((f) => f.value === c)?.label ??
              getCollectionFilterLabel(c)
            const next = {
              ...state,
              collection: state.collection.filter((x) => x !== c),
            }
            return (
              <ActiveChip
                key={`col-${c}`}
                label={label}
                removeHref={buildCatalogHref(basePath, next)}
                onRemove={onClientNavigate ? () => navigate(next) : undefined}
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
              onRemove={
                onClientNavigate
                  ? () =>
                      navigate({
                        ...state,
                        priceMin: undefined,
                        priceMax: undefined,
                      })
                  : undefined
              }
            />
          )}
        </div>
      )}

      {facets.collections.length > 0 && (
        <fieldset className="catalog-filter-group">
          <legend>Коллекции</legend>
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
              onClick={(e) =>
                onFilterLinkClick(e, { ...state, collection: [] })
              }
            >
              <span>Все</span>
              <span className="catalog-filter-count">
                {facets.collections.reduce((sum, opt) => sum + opt.count, 0)}
              </span>
            </Link>
            {facets.collections.map((opt) => {
              const active = state.collection.includes(opt.value)
              const next = {
                ...state,
                collection: toggleMulti(state.collection, opt.value),
              }
              return (
                <Link
                  key={opt.value}
                  href={buildCatalogHref(basePath, next)}
                  className={
                    active
                      ? "catalog-filter-option catalog-filter-option-active"
                      : "catalog-filter-option"
                  }
                  scroll={false}
                  aria-pressed={active}
                  onClick={(e) => onFilterLinkClick(e, next)}
                >
                  <span>{opt.label}</span>
                  <span className="catalog-filter-count">{opt.count}</span>
                </Link>
              )
            })}
          </div>
        </fieldset>
      )}

      {facets.categories.length > 0 && (
        <fieldset className="catalog-filter-group">
          <legend>Тип изделия</legend>
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
              onClick={(e) => onFilterLinkClick(e, { ...state, category: [] })}
            >
              <span>Все</span>
              <span className="catalog-filter-count">
                {facets.categories.reduce((sum, opt) => sum + opt.count, 0)}
              </span>
            </Link>
            {facets.categories.map((opt) => {
              const active = state.category.includes(opt.value)
              const next = {
                ...state,
                category: toggleMulti(state.category, opt.value),
              }
              return (
                <Link
                  key={opt.value}
                  href={buildCatalogHref(basePath, next)}
                  className={
                    active
                      ? "catalog-filter-option catalog-filter-option-active"
                      : "catalog-filter-option"
                  }
                  scroll={false}
                  aria-pressed={active}
                  onClick={(e) => onFilterLinkClick(e, next)}
                >
                  <span>{opt.label}</span>
                  <span className="catalog-filter-count">{opt.count}</span>
                </Link>
              )
            })}
          </div>
        </fieldset>
      )}
      </div>

      <fieldset className="catalog-filter-group catalog-filter-group-price">
        <legend>Цена</legend>
        <CatalogPriceFilter
          priceMin={state.priceMin}
          priceMax={state.priceMax}
          priceRange={facets.priceRange}
          onApply={(priceMin, priceMax) =>
            navigate({ ...state, priceMin, priceMax })
          }
        />
      </fieldset>
    </div>
  )

  return (
    <div className="catalog-filter-shell" data-pending={isPending ? "true" : undefined}>
      <div className="catalog-controls">
        <nav
          className="filter-tabs"
          aria-label="Тип товара"
          ref={tabsRef}
          data-slider={tabIndicator ? "true" : undefined}
          onPointerOver={onTabsPointerOver}
          onPointerLeave={onTabsPointerLeave}
          onPointerDown={onTabsPointerDown}
        >
          <span
            ref={ghostRef}
            className="filter-tabs-hover-ghost"
            aria-hidden="true"
          />
          {tabIndicator && (
            <span
              className="filter-tabs-indicator"
              aria-hidden="true"
              style={{
                transform: `translate3d(${tabIndicator.left}px, ${tabIndicator.top}px, 0)`,
                width: tabIndicator.width,
                height: tabIndicator.height,
              }}
            />
          )}
          <Link
            href={buildCatalogHref(basePath, { ...state, type: undefined })}
            className={!activeType ? "filter-tab filter-tab-active" : "filter-tab"}
            scroll={false}
            onClick={(e) =>
              onFilterLinkClick(e, { ...state, type: undefined }, () =>
                setPendingType({ type: undefined })
              )
            }
          >
            Все
          </Link>
          {facets.types.map((opt) => {
            const isActive = activeType === opt.value
            const nextType =
              state.type === opt.value
                ? undefined
                : (opt.value as CatalogFilterState["type"])
            const next = { ...state, type: nextType }
            return (
              <Link
                key={opt.value}
                href={buildCatalogHref(basePath, next)}
                className={
                  isActive ? "filter-tab filter-tab-active" : "filter-tab"
                }
                scroll={false}
                onClick={(e) =>
                  onFilterLinkClick(e, next, () =>
                    setPendingType({ type: nextType })
                  )
                }
              >
                {PRODUCT_TYPE_FILTER_LABELS[opt.value] ?? opt.label}
              </Link>
            )
          })}
        </nav>
        {/* Отдельный сценарий (переход в раздел «По проекту»), поэтому вне
            segmented control — тёмной pill-кнопкой рядом. */}
        {hasBespokeTab && (
          <Link href="/bespoke" className="catalog-bespoke-cta" scroll={false}>
            По проекту
          </Link>
        )}
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
          <div className="catalog-search-input-wrap">
            <input
              id="catalog-search-input"
              name="q"
              type="search"
              value={searchDraft}
              onChange={(e) => setSearchDraft(e.target.value)}
              placeholder="Поиск по названию, коллекции или категории"
              autoComplete="off"
            />
            {searchDraft && (
              <button
                type="button"
                className="catalog-search-clear"
                aria-label="Очистить поиск"
                onClick={() => setSearchDraft("")}
              >
                <svg viewBox="0 0 12 12" width="10" height="10" aria-hidden="true">
                  <path
                    d="M1 1L11 11M11 1L1 11"
                    stroke="currentColor"
                    strokeWidth="1.4"
                    strokeLinecap="round"
                  />
                </svg>
              </button>
            )}
          </div>
          <p className="catalog-result-count" aria-live="polite">
            Найдено {resultCount}
          </p>
          <button type="submit" className="catalog-search-btn">
            Найти
          </button>
        </form>

        <div className="catalog-filter-toolbar-actions">
          <div className="catalog-sort">
            <span aria-hidden="true">Сортировка</span>
            <CatalogSortDropdown
              ariaLabel="Сортировка"
              value={state.sort ?? "default"}
              options={[
                { value: "default", label: "По умолчанию" },
                { value: "price_asc", label: "Цена: по возрастанию" },
                { value: "price_desc", label: "Цена: по убыванию" },
              ]}
              onChange={(v) => {
                navigate({
                  ...state,
                  sort:
                    v === "price_asc" || v === "price_desc" ? v : undefined,
                })
              }}
            />
          </div>

          <button
            ref={filterToggleRef}
            type="button"
            className="catalog-filter-mobile-toggle"
            aria-expanded={mobileOpen}
            aria-controls={CATALOG_FILTER_SIDEBAR_ID}
            aria-label={
              mobileOpen ? a11yCopy.closeFilters : a11yCopy.openFilters
            }
            onClick={() => setMobileOpen((v) => !v)}
          >
            Фильтры
          </button>
        </div>
      </div>

      <div className="catalog-filter-layout">
        <aside
          ref={sidebarRef}
          id={CATALOG_FILTER_SIDEBAR_ID}
          className={`catalog-filter-sidebar ${mobileOpen ? "catalog-filter-sidebar-open" : ""}`}
          aria-label={a11yCopy.catalogFiltersLabel}
          /* The bootstrap script mutates this element's style attribute
             before hydration — expected, not a markup mismatch. */
          suppressHydrationWarning
        >
          {filterPanel}
          <button
            type="button"
            className="catalog-filter-apply-mobile"
            aria-label={a11yCopy.applyFilters}
            onClick={() => {
              setMobileOpen(false)
              requestAnimationFrame(() => filterToggleRef.current?.focus())
            }}
          >
            Показать
          </button>
          <script
            nonce={cspNonce}
            dangerouslySetInnerHTML={{ __html: FILTER_FIT_BOOTSTRAP }}
          />
        </aside>
        <div className="catalog-product-area">{children}</div>
      </div>
    </div>
  )
}

/** Draft-based price inputs: navigation happens only on explicit apply
    (button / Enter), never on blur — no surprise page reloads while typing.
    Clearing resets only the price, other filters stay in the query string. */
function CatalogPriceFilter({
  priceMin,
  priceMax,
  priceRange,
  onApply,
}: {
  priceMin?: number
  priceMax?: number
  priceRange: CatalogFacets["priceRange"]
  onApply: (priceMin?: number, priceMax?: number) => void
}) {
  const [minDraft, setMinDraft] = useState(priceMin != null ? String(priceMin) : "")
  const [maxDraft, setMaxDraft] = useState(priceMax != null ? String(priceMax) : "")

  useEffect(() => {
    setMinDraft(priceMin != null ? String(priceMin) : "")
  }, [priceMin])
  useEffect(() => {
    setMaxDraft(priceMax != null ? String(priceMax) : "")
  }, [priceMax])

  const parseDraft = (raw: string): number | undefined => {
    const t = raw.trim()
    if (!t) return undefined
    const n = Number.parseInt(t, 10)
    return Number.isFinite(n) && n >= 0 ? n : undefined
  }

  const apply = () => onApply(parseDraft(minDraft), parseDraft(maxDraft))
  const onEnter = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      e.preventDefault()
      apply()
    }
  }

  return (
    <div className="catalog-filter-price-block">
      <div className="catalog-filter-price">
        <label>
          <span className="sr-only">Цена от, рублей</span>
          <input
            type="number"
            inputMode="numeric"
            placeholder="от"
            min={0}
            value={minDraft}
            onChange={(e) => setMinDraft(e.target.value)}
            onKeyDown={onEnter}
          />
        </label>
        <span className="catalog-filter-price-dash" aria-hidden>
          —
        </span>
        <label>
          <span className="sr-only">Цена до, рублей</span>
          <input
            type="number"
            inputMode="numeric"
            placeholder="до"
            min={0}
            value={maxDraft}
            onChange={(e) => setMaxDraft(e.target.value)}
            onKeyDown={onEnter}
          />
        </label>
      </div>
      {priceRange && (
        <p className="catalog-filter-price-hint">
          {priceRange.min.toLocaleString("ru-RU")}
          {"\u00A0– "}
          {priceRange.max.toLocaleString("ru-RU")} ₽
        </p>
      )}
      <div className="catalog-filter-price-actions">
        <button
          type="button"
          className="catalog-filter-price-apply"
          onClick={apply}
        >
          Применить
        </button>
      </div>
    </div>
  )
}

function ActiveChip({
  label,
  removeHref,
  onRemove,
}: {
  label: string
  removeHref: string
  onRemove?: () => void
}) {
  return (
    <span className="catalog-active-chip">
      {label}
      <Link
        href={removeHref}
        scroll={false}
        aria-label={`Убрать фильтр ${label}`}
        onClick={(e) => {
          if (!onRemove) return
          if (!isUnmodifiedPrimaryClick(e)) return
          e.preventDefault()
          onRemove()
        }}
      >
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
