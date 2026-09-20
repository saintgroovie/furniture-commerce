"use client"

import Link from "next/link"
import { useCallback, useEffect, useMemo, useState, useTransition } from "react"
import { ProductCard } from "@/components/product-card"
import { PromotionCard } from "@/components/promotion-card"
import { CatalogFilterControls } from "@/components/catalog-filter-controls"
import { CopyLines } from "@/components/copy-lines"
import { fetchStoreCatalogProducts } from "@/lib/api/catalog-browse-pool-client"
import type { PromotionSlotPayload } from "@/lib/api/promotion-slot"
import { toCatalogBrowseClientProducts } from "@/lib/catalog-browse-client-product"
import {
  scopeCatalogBrowsePool,
  type CatalogBrowsePoolScope,
} from "@/lib/catalog-browse-pool"
import { shouldShowPromotionWindow } from "@/lib/promotion-window-placement"
import {
  buildCatalogHref,
  parseCatalogFilterState,
} from "@/lib/catalog-filter-params"
import {
  applyCatalogFilters,
  buildAllCatalogFacets,
  sortDisplayEntries,
  type CatalogFilterState,
} from "@/lib/catalog-filters"
import { groupProductsForDisplay } from "@/lib/display-group"
import { isUnmodifiedPrimaryClick } from "@/lib/client/is-unmodified-primary-click"
import { actions, catalogUiCopy, promotionCopy, states } from "@/lib/woodright-copy"
import { catalogCardAtfFlags } from "@/lib/catalog-atf"

export type CatalogBrowseCopy = {
  emptyFilteredTitle: string
  emptyFilteredBody: string[]
}

type Props = {
  basePath: "/catalog" | "/kids/catalog"
  initialState: CatalogFilterState
  /**
   * First-screen representatives only. Full scoped pool is fetched after
   * hydration so RSC HTML does not serialize every browse product.
   */
  atfProducts: Array<Record<string, unknown>>
  poolScope: CatalogBrowsePoolScope
  kidsProductIds: string[]
  showBespokeCta?: boolean
  emptyCopy: CatalogBrowseCopy
  emptySecondaryHref?: string
  emptySecondaryLabel?: string
  /**
   * Resolved Promotion Window payload (server-fetched). Rendered once as a
   * separate sticky window in the right gutter next to the grid (see
   * `promotion-window-placement.ts`). `null` = plain catalog.
   */
  promotionSlot?: PromotionSlotPayload | null
}

function stateFromLocation(): CatalogFilterState {
  if (typeof window === "undefined") {
    return { category: [], collection: [] }
  }
  return parseCatalogFilterState(
    Object.fromEntries(new URLSearchParams(window.location.search))
  )
}

/**
 * SSR ships ATF representatives + kids membership ids (small).
 * After hydration the client loads `/store/catalog-products` and scopes
 * the full pool. Filter clicks then recompute locally (no RSC refetch).
 */
export function CatalogBrowseClient({
  basePath,
  initialState,
  atfProducts,
  poolScope,
  kidsProductIds,
  showBespokeCta = false,
  emptyCopy,
  emptySecondaryHref,
  emptySecondaryLabel,
  promotionSlot = null,
}: Props) {
  const [state, setState] = useState<CatalogFilterState>(initialState)
  const [pool, setPool] = useState<Array<Record<string, unknown>> | null>(null)
  const [poolStatus, setPoolStatus] = useState<"atf" | "full" | "error">("atf")
  const [retryTick, setRetryTick] = useState(0)
  const [, startTransition] = useTransition()
  const products = pool ?? atfProducts
  const poolReady = poolStatus === "full"
  const kidsKey = kidsProductIds.join(",")

  useEffect(() => {
    const onPopState = () => {
      startTransition(() => setState(stateFromLocation()))
    }
    window.addEventListener("popstate", onPopState)
    return () => window.removeEventListener("popstate", onPopState)
  }, [])

  useEffect(() => {
    let cancelled = false
    setPoolStatus("atf")
    ;(async () => {
      try {
        const raw = await fetchStoreCatalogProducts()
        const ids = kidsKey ? kidsKey.split(",") : []
        const scoped = toCatalogBrowseClientProducts(
          scopeCatalogBrowsePool(raw, poolScope, ids)
        )
        if (!cancelled) {
          setPool(scoped)
          setPoolStatus("full")
        }
      } catch {
        if (!cancelled) setPoolStatus("error")
      }
    })()
    return () => {
      cancelled = true
    }
  }, [poolScope, kidsKey, retryTick])

  const onClientNavigate = useCallback(
    (next: CatalogFilterState) => {
      const href = buildCatalogHref(basePath, next)
      window.history.pushState(null, "", href)
      setState(next)
    },
    [basePath]
  )

  const filtered = useMemo(
    () => applyCatalogFilters(products, state),
    [products, state]
  )
  const facets = useMemo(
    () => buildAllCatalogFacets(products, state),
    [products, state]
  )
  const displayEntries = useMemo(
    () => sortDisplayEntries(groupProductsForDisplay(filtered), state.sort),
    [filtered, state.sort]
  )

  /* Promotion Window lives outside the grid (right gutter rail).
     ItemList JSON-LD is server-rendered (slim id/title), not in this client. */
  const promotionWindow = shouldShowPromotionWindow(promotionSlot, displayEntries.length) ? (
    <aside className="catalog-promo-sidebar" aria-label={promotionCopy.windowLabel}>
      <div className="catalog-promo-panel">
        <PromotionCard slot={promotionSlot} />
      </div>
    </aside>
  ) : null

  const dataState = !poolReady
    ? poolStatus === "error"
      ? "error"
      : "loading"
    : displayEntries.length === 0
      ? "empty"
      : "success"

  const poolBanner =
    poolStatus === "error" ? (
      <div className="status-message" data-catalog-pool-error="">
        <p style={{ fontWeight: 500 }}>{catalogUiCopy.poolIncomplete}</p>
        <div
          className="nav-links nav-links-center"
          style={{ marginTop: "1rem" }}
        >
          <button
            type="button"
            className="catalog-search-btn"
            onClick={() => setRetryTick((n) => n + 1)}
          >
            {catalogUiCopy.poolRetry}
          </button>
        </div>
      </div>
    ) : null

  return (
    <div
      data-state={dataState}
      data-catalog-browse="client"
      data-catalog-pool={poolStatus}
      aria-busy={poolStatus === "atf"}
    >
      <CatalogFilterControls
        basePath={basePath}
        state={state}
        facets={facets}
        resultCount={displayEntries.length}
        resultCountPending={!poolReady}
        showBespokeCta={showBespokeCta}
        onClientNavigate={onClientNavigate}
        sideRail={promotionWindow}
      >
        {poolBanner}
        {displayEntries.length === 0 ? (
          poolReady ? (
          <div className="status-message catalog-empty-state">
            <p style={{ fontWeight: 500 }}>{emptyCopy.emptyFilteredTitle}</p>
            <CopyLines lines={emptyCopy.emptyFilteredBody} />
            <div
              className="nav-links nav-links-center"
              style={{ marginTop: "1rem" }}
            >
              <Link
                href={basePath}
                onClick={(e) => {
                  if (!isUnmodifiedPrimaryClick(e)) return
                  e.preventDefault()
                  onClientNavigate({ category: [], collection: [] })
                }}
              >
                {actions.resetFilters}
              </Link>
              {emptySecondaryHref && emptySecondaryLabel ? (
                <Link href={emptySecondaryHref}>{emptySecondaryLabel}</Link>
              ) : null}
            </div>
          </div>
          ) : poolStatus === "error" ? null : (
            <p className="info-text">{states.loadingCatalog}</p>
          )
        ) : (
          <ul className="product-grid catalog-product-grid">
            {displayEntries.map((entry, index) => {
              const atf = catalogCardAtfFlags(index)
              return (
              <li key={(entry.product as Record<string, unknown>).id as string}>
                <ProductCard
                  product={entry.product as never}
                  displayGroup={entry.displayGroup}
                  priorityHero={atf.priorityHero}
                  atfHero={atf.atfHero}
                />
              </li>
              )
            })}
          </ul>
        )}
      </CatalogFilterControls>
    </div>
  )
}
