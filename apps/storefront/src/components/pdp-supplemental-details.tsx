"use client"

import { usePathname, useSearchParams } from "next/navigation"
import { materialCodeForProduct, usePdpMaterialSelection } from "@/lib/cart/pdp-material-selection"
import { supplementalRowsForRoute, supplementalRouteMatches, type PdpSupplementView } from "@/lib/pdp-supplement-view"

/** Only server-validated selected display rows; no native product/data ledger props. */
export function PdpSupplementalDetails({ record }: { record: PdpSupplementView }) {
  const pathname = usePathname(), search = useSearchParams(), selection = usePdpMaterialSelection()
  let routeKey = ""
  try { routeKey = decodeURIComponent(pathname.replace(/^\/product\//, "").replace(/\/$/, "")) } catch { /* Keep stale facts hidden. */ }
  const variant = search.get("variant")
  const code = search.get("material") ?? materialCodeForProduct(selection, record.productKey) ?? record.initialMaterialCode
  const rows = supplementalRowsForRoute(record, routeKey, variant, code)
  if (!supplementalRouteMatches(record, routeKey, variant)) return null
  if (!rows.length && !record.deliveryHref) return null
  return <div className="pdp-specs-block" data-supplemental-details={record.variantId}>
    {rows.length > 0 && <><h2>Дополнительные сведения</h2><dl className="pdp-specs-list">
      {rows.map((row, i) => <div className="pdp-specs-row" key={row.label + i}><dt>{row.label}</dt><dd>{row.value}</dd></div>)}
    </dl></>}
    {record.deliveryHref && <a className="pdp-service-link" href={record.deliveryHref}>Условия доставки</a>}
  </div>
}
