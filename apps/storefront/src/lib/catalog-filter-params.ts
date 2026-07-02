import {
  normalizeCollectionFilterKey,
  type CatalogFilterState,
} from "./catalog-filters"

export type CatalogSearchParams = Record<string, string | string[] | undefined>

function firstString(value: string | string[] | undefined): string | undefined {
  if (value == null) return undefined
  return Array.isArray(value) ? value[0] : value
}

function parseMulti(
  value: string | string[] | undefined,
  normalize: (value: string) => string = (value) => value.toLowerCase()
): string[] {
  if (value == null) return []
  const raw = Array.isArray(value) ? value.join(",") : value
  return raw
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .map(normalize)
    .filter(Boolean)
}

function parsePositiveInt(value: string | undefined): number | undefined {
  if (!value?.trim()) return undefined
  const n = Number.parseInt(value, 10)
  if (!Number.isFinite(n) || n < 0) return undefined
  return n
}

export function parseCatalogFilterState(
  searchParams: CatalogSearchParams
): CatalogFilterState {
  const typeRaw =
    firstString(searchParams.type) ?? firstString(searchParams.product_type)
  const type =
    typeRaw === "STANDARD" || typeRaw === "CONFIGURABLE" ? typeRaw : undefined

  const sortRaw = firstString(searchParams.sort)
  const sort: CatalogFilterState["sort"] =
    sortRaw === "price_asc" || sortRaw === "price_desc" ? sortRaw : undefined

  const q = firstString(searchParams.q)?.trim() || undefined

  return {
    q,
    type,
    category: parseMulti(searchParams.category),
    collection: parseMulti(searchParams.collection, normalizeCollectionFilterKey),
    priceMin: parsePositiveInt(firstString(searchParams.price_min)),
    priceMax: parsePositiveInt(firstString(searchParams.price_max)),
    sort,
  }
}

/** Serialize filter state to URLSearchParams (omits empty / default values). */
export function serializeCatalogFilterState(
  state: CatalogFilterState
): URLSearchParams {
  const params = new URLSearchParams()
  if (state.q) params.set("q", state.q)
  if (state.type) params.set("type", state.type)
  if (state.category.length) params.set("category", state.category.join(","))
  if (state.collection.length) params.set("collection", state.collection.join(","))
  if (state.priceMin != null) params.set("price_min", String(state.priceMin))
  if (state.priceMax != null) params.set("price_max", String(state.priceMax))
  if (state.sort) params.set("sort", state.sort)
  return params
}

export function buildCatalogHref(
  basePath: string,
  state: CatalogFilterState
): string {
  const qs = serializeCatalogFilterState(state).toString()
  return qs ? `${basePath}?${qs}` : basePath
}

/** Legacy redirect helper: product_type → type */
export function catalogLegacyTypeRedirectQuery(
  searchParams: CatalogSearchParams
): string | null {
  const legacy = searchParams.product_type
  if (!legacy || searchParams.type) return null
  const params = new URLSearchParams()
  for (const [k, v] of Object.entries(searchParams)) {
    if (k === "product_type") continue
    if (v == null) continue
    if (Array.isArray(v)) v.forEach((x) => params.append(k, x))
    else params.set(k, v)
  }
  const typeVal = Array.isArray(legacy) ? legacy[0] : legacy
  if (typeVal) params.set("type", typeVal)
  return params.toString()
}
