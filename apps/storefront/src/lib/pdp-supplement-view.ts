export type SupplementalRow = { label: string; value: string }
export type PdpSupplementView = {
  routeKey: string; productKey: string; productId: string; variantId: string; sku: string
  urlVariantAtRender: string | null
  rows: SupplementalRow[]; materials: Record<string, string>
  initialMaterialCode: string | null; deliveryHref: "/delivery" | null
}

/** Old SSR facts disappear immediately when a sibling URL takes over. */
export function supplementalRowsForRoute(record: PdpSupplementView | null, routeKey: string,
  urlVariant: string | null, materialCode: string | null): SupplementalRow[] {
  if (!record || record.routeKey !== routeKey || record.urlVariantAtRender !== urlVariant) return []
  const material = materialCode && Object.hasOwn(record.materials, materialCode) ? record.materials[materialCode] : null
  return typeof material === "string" && material.length > 0 ? [...record.rows, { label: "Материал", value: material }] : record.rows
}
export function supplementalRouteMatches(record: PdpSupplementView | null, routeKey: string, urlVariant: string | null) {
  return !!record && record.routeKey === routeKey && record.urlVariantAtRender === urlVariant
}
