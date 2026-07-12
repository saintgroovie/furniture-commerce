import type { AdminProductPayload, PriceAmount } from "./types"

const PRODUCT_FIELDS = [
  "id",
  "title",
  "description",
  "handle",
  "status",
  "thumbnail",
  "updated_at",
  "*collection",
  "*images",
  "*options",
  "*options.values",
  "*variants",
  "*variants.options",
  "*variants.prices",
  // Medusa 2.13 Admin REST expects snake_case for custom link populate.
  "*product_classification",
  "+metadata",
].join(",")

export async function fetchAdminProduct(
  productId: string,
  init?: RequestInit
): Promise<{ product: AdminProductPayload } | { status: number; body: unknown }> {
  const res = await fetch(
    `/admin/products/${encodeURIComponent(productId)}?fields=${encodeURIComponent(PRODUCT_FIELDS)}`,
    {
      credentials: "include",
      ...init,
      headers: {
        Accept: "application/json",
        ...(init?.headers ?? {}),
      },
    }
  )
  const body = await res.json().catch(() => ({}))
  if (!res.ok) return { status: res.status, body }
  return { product: (body as { product: AdminProductPayload }).product }
}

export async function fetchVariantPrices(
  productId: string,
  init?: RequestInit
): Promise<
  | {
      variants: Array<{
        id: string
        sku?: string | null
        title?: string | null
        manage_inventory?: boolean | null
        options?: Array<{
          id?: string
          value?: string | null
          option_id?: string | null
          option?: { id?: string; title?: string | null } | null
        }>
        prices?: PriceAmount[]
      }>
      count?: number
      truncated: boolean
    }
  | { status: number; body: unknown }
> {
  const fields = "id,sku,title,manage_inventory,*prices,*options"
  const limit = 100
  const res = await fetch(
    `/admin/products/${encodeURIComponent(productId)}/variants?fields=${encodeURIComponent(fields)}&limit=${limit}`,
    {
      credentials: "include",
      ...init,
      headers: {
        Accept: "application/json",
        ...(init?.headers ?? {}),
      },
    }
  )
  const body = await res.json().catch(() => ({}))
  if (!res.ok) return { status: res.status, body }
  const variants = (
    body as {
      variants: Array<{
        id: string
        sku?: string | null
        title?: string | null
        manage_inventory?: boolean | null
        options?: Array<{
          id?: string
          value?: string | null
          option_id?: string | null
          option?: { id?: string; title?: string | null } | null
        }>
        prices?: PriceAmount[]
      }>
      count?: number
    }
  ).variants
  const count = (body as { count?: number }).count
  return {
    variants,
    count,
    truncated: typeof count === "number" ? count > variants.length : variants.length >= limit,
  }
}

export async function updateAdminProduct(
  productId: string,
  payload: { title?: string; description?: string; status?: string },
  init?: RequestInit
): Promise<{ product: AdminProductPayload } | { status: number; body: unknown }> {
  const res = await fetch(`/admin/products/${encodeURIComponent(productId)}`, {
    method: "POST",
    credentials: "include",
    ...init,
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
    body: JSON.stringify(payload),
  })
  const body = await res.json().catch(() => ({}))
  if (!res.ok) return { status: res.status, body }
  return { product: (body as { product: AdminProductPayload }).product }
}

export async function updateAdminProductVariant(
  productId: string,
  variantId: string,
  payload: {
    sku?: string | null
    prices?: Array<{ id?: string; amount: number; currency_code: string }>
  },
  init?: RequestInit
): Promise<{ product: AdminProductPayload } | { status: number; body: unknown }> {
  const res = await fetch(
    `/admin/products/${encodeURIComponent(productId)}/variants/${encodeURIComponent(variantId)}`,
    {
      method: "POST",
      credentials: "include",
      ...init,
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
        ...(init?.headers ?? {}),
      },
      body: JSON.stringify(payload),
    }
  )
  const body = await res.json().catch(() => ({}))
  if (!res.ok) return { status: res.status, body }
  return { product: (body as { product: AdminProductPayload }).product }
}

/**
 * Load product + authoritative variants list (limit 100) and merge variants into product.
 * Prefer variants endpoint for price/SKU completeness; keep product-level options.
 * Fails closed if the variants/prices list cannot be loaded — product embed alone is not
 * safe for full-replacement price mutations.
 */
export async function fetchProductWorkspaceBundle(
  productId: string,
  init?: RequestInit
): Promise<
  | { product: AdminProductPayload; truncated: boolean }
  | { status: number; body: unknown }
> {
  const prodRes = await fetchAdminProduct(productId, init)
  if ("status" in prodRes) return prodRes
  const pricesRes = await fetchVariantPrices(productId, init)
  if ("status" in pricesRes) return pricesRes
  const byId = new Map((prodRes.product.variants ?? []).map((v) => [v.id, v]))
  const incomplete: string[] = []
  const mergedVariants = pricesRes.variants.map((v) => {
    const prev = byId.get(v.id)
    // Missing `prices` on the variants-list payload is incomplete hydration — do not
    // silently fall back to product embed (may omit currencies for full replacement).
    if (!("prices" in v) || v.prices == null) {
      incomplete.push(v.id)
    }
    return {
      ...(prev ?? {}),
      ...v,
      options: v.options ?? prev?.options,
      prices: Array.isArray(v.prices) ? v.prices : [],
    }
  })
  if (incomplete.length) {
    return {
      status: 502,
      body: {
        message: `Variant prices hydration incomplete for: ${incomplete.slice(0, 5).join(", ")}`,
        code: "incomplete_variant_prices",
      },
    }
  }
  return {
    product: {
      ...prodRes.product,
      variants: mergedVariants,
    },
    truncated: pricesRes.truncated,
  }
}

export function stockAdminProductPath(productId: string): string {
  return `/app/products/${productId}`
}

export function woodrightWorkspacePath(productId: string): string {
  return `/app/woodright/products/${productId}`
}
