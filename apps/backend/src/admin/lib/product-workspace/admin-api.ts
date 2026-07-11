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
  "*variants",
  "*productType",
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
  | { variants: Array<{ id: string; sku?: string | null; prices?: PriceAmount[] }> }
  | { status: number; body: unknown }
> {
  const fields = "id,sku,title,*prices"
  const res = await fetch(
    `/admin/products/${encodeURIComponent(productId)}/variants?fields=${encodeURIComponent(fields)}&limit=100`,
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
  return {
    variants: (body as { variants: Array<{ id: string; sku?: string | null; prices?: PriceAmount[] }> })
      .variants,
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

export function stockAdminProductPath(productId: string): string {
  return `/app/products/${productId}`
}

export function woodrightWorkspacePath(productId: string): string {
  return `/app/woodright/products/${productId}`
}
