import { getBaseUrl, medusaFetch } from "./base"

export type MotifCtaKind = "view_product" | "view_furniture" | "view_collection"

export type MotifProductCard = {
  handle: string
  title: string
  thumbnail: string | null
  price_amount: number | null
  motif_key: string
  motif_slug: string
  motif_title: string
  family_title: string
}

export type MotifTheme = {
  motif_key: string
  motif_slug: string
  motif_title: string
  motif_cover: string | null
  motif_description: string | null
  motif_available_family_count: number
  motif_available_product_count: number
  cta_kind: MotifCtaKind
  cta_label: string
  available_family_titles: string[]
  preview_products: MotifProductCard[]
}

export type MotifThemeDetail = MotifTheme & {
  products: MotifProductCard[]
}

export type MotifOption = {
  motif_key: string
  motif_slug: string
  motif_title: string
  motif_cover: string | null
  product_handle: string
  title: string
  price_amount: number | null
  selected: boolean
}

export type MotifContextStatus =
  | "absent"
  | "matched"
  | "redirect"
  | "unsupported"
  | "unknown"

export type MotifContext = {
  handle: string
  motif_status: MotifContextStatus
  selected_motif: {
    motif_key: string
    motif_slug: string
    motif_title: string
  } | null
  redirect_handle: string | null
  motif_options: MotifOption[]
  related_products_in_motif: MotifProductCard[]
  motif_page_path: string | null
}

async function readError(res: Response, fallback: string): Promise<string> {
  const text = await res.text()
  try {
    const data = text ? JSON.parse(text) : null
    if (data && typeof (data as { message?: unknown }).message === "string") {
      return (data as { message: string }).message
    }
  } catch {
    /* keep fallback */
  }
  return text || fallback
}

export async function getMotifThemes(): Promise<{ motif_themes: MotifTheme[] }> {
  const base = getBaseUrl()
  const res = await medusaFetch(`${base}/store/motif-themes`)
  if (!res.ok) {
    throw new Error(await readError(res, "Не удалось загрузить росписи"))
  }
  return res.json()
}

export async function getMotifTheme(
  slug: string
): Promise<{ motif_theme: MotifThemeDetail } | null> {
  const base = getBaseUrl()
  const res = await medusaFetch(
    `${base}/store/motif-themes/${encodeURIComponent(slug)}`
  )
  if (res.status === 404) return null
  if (!res.ok) {
    throw new Error(await readError(res, "Не удалось загрузить роспись"))
  }
  return res.json()
}

export async function getMotifContext(args: {
  handle: string
  motif?: string | null
}): Promise<MotifContext | null> {
  const base = getBaseUrl()
  const search = new URLSearchParams({ handle: args.handle })
  if (args.motif && args.motif.trim()) search.set("motif", args.motif.trim())
  const res = await medusaFetch(`${base}/store/motif-context?${search}`)
  if (res.status === 404) return null
  if (!res.ok) {
    throw new Error(await readError(res, "Не удалось загрузить росписи товара"))
  }
  const data = (await res.json()) as { motif_context?: MotifContext }
  return data.motif_context ?? null
}
