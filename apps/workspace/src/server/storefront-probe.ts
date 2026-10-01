import "server-only"

export type StorefrontProbe = "match" | "miss" | "skipped"

/** Buyer HTML check. A failed probe does not roll back the saved write. */
export async function probeBuyerPrice(productId: string, amount: number | null): Promise<StorefrontProbe> {
  const base = process.env.WOODRIGHT_STOREFRONT_INTERNAL_URL?.replace(/\/$/, "")
  if (!base || amount == null) return "skipped"
  const formatted = new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 0 }).format(amount)
  const spaced = formatted.replace(/\u00a0/g, " ")
  try {
    const response = await fetch(`${base}/product/${encodeURIComponent(productId)}`, {
      cache: "no-store",
      signal: AbortSignal.timeout(5000),
    })
    if (!response.ok) return "miss"
    const html = await response.text()
    if (html.includes(formatted) || html.includes(spaced) || html.includes(String(amount))) return "match"
    return "miss"
  } catch {
    return "miss"
  }
}
