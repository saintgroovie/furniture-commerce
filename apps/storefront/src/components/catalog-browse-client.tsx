"use client"

import Link from "next/link"
import { useCallback, useEffect, useMemo, useState, useTransition } from "react"
import { ProductCard } from "@/components/product-card"
import { CatalogFilterControls } from "@/components/catalog-filter-controls"
import { CopyLines } from "@/components/copy-lines"
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
import { actions } from "@/lib/woodright-copy"
import { useCspNonce } from "@/lib/csp-nonce"

export type CatalogBrowseCopy = {
  emptyFilteredTitle: string
  emptyFilteredBody: string[]
}

type Props = {
  basePath: "/catalog" | "/kids/catalog"
  initialState: CatalogFilterState
  /** Scoped pool (main without kids / kids-only). Serializable Medusa products. */
  products: Array<Record<string, unknown>>
  showBespokeCta?: boolean
  emptyCopy: CatalogBrowseCopy
  emptySecondaryHref?: string
  emptySecondaryLabel?: string
  /** Absolute site origin for ItemList JSON-LD (e.g. getSiteUrl()). */
  siteUrl?: string
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
 * First SSR ships scoped products + initial filter state.
 * Subsequent filter clicks update URL via history and recompute locally
 * (no Medusa / RSC refetch).
 */
export function CatalogBrowseClient({
  basePath,
  initialState,
  products,
  showBespokeCta = false,
  emptyCopy,
  emptySecondaryHref,
  emptySecondaryLabel,
  siteUrl,
}: Props) {
  const [state, setState] = useState<CatalogFilterState>(initialState)
  const [, startTransition] = useTransition()

  useEffect(() => {
    const onPopState = () => {
      startTransition(() => setState(stateFromLocation()))
    }
    window.addEventListener("popstate", onPopState)
    return () => window.removeEventListener("popstate", onPopState)
  }, [])

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

  const itemListJsonLd = useMemo(() => {
    if (!siteUrl || displayEntries.length === 0) return null
    const base = siteUrl.replace(/\/$/, "")
    return {
      "@context": "https://schema.org",
      "@type": "ItemList",
      numberOfItems: displayEntries.length,
      itemListElement: displayEntries.map((entry, i) => ({
        "@type": "ListItem",
        position: i + 1,
        url: `${base}/product/${(entry.product as Record<string, unknown>).id}`,
        name:
          ((entry.product as Record<string, unknown>).title as string) ??
          undefined,
      })),
    }
  }, [siteUrl, displayEntries])

  const dataState = displayEntries.length === 0 ? "empty" : "success"
  const cspNonce = useCspNonce()

  return (
    <div data-state={dataState} data-catalog-browse="client">
      {itemListJsonLd && (
        <script
          type="application/ld+json"
          nonce={cspNonce}
          dangerouslySetInnerHTML={{ __html: JSON.stringify(itemListJsonLd) }}
        />
      )}
      <CatalogFilterControls
        basePath={basePath}
        state={state}
        facets={facets}
        resultCount={displayEntries.length}
        showBespokeCta={showBespokeCta}
        onClientNavigate={onClientNavigate}
      >
        {displayEntries.length === 0 ? (
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
        ) : (
          <ul className="product-grid catalog-product-grid">
            {displayEntries.map((entry, index) => (
              <li key={(entry.product as Record<string, unknown>).id as string}>
                <ProductCard
                  product={entry.product as never}
                  displayGroup={entry.displayGroup}
                  priorityHero={index === 0}
                />
              </li>
            ))}
          </ul>
        )}
      </CatalogFilterControls>
    </div>
  )
}
