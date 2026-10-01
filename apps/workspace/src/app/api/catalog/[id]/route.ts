import { medusaSend } from "@/server/medusa"
import { probeBuyerPrice } from "@/server/storefront-probe"
import { writeAndReturn } from "@/server/write"

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params
  const form = await request.formData()
  const intent = String(form.get("intent") ?? "")
  const anchor = intent === "price" || intent === "promo" ? "#price" : intent === "hero" || intent === "reorder" || intent === "detach" ? "#media" : intent === "publish" || intent === "unpublish" || intent === "classification" ? "#publish" : intent === "dimensions" ? "#dimensions" : ""
  // On a price conflict the employee's amount must stay visible next to the server amount.
  const keep: Record<string, string> =
    intent === "price"
      ? { your_amount: String(form.get("amount") ?? "").replace(/\s/g, ""), variant_id: String(form.get("variant_id") ?? "") }
      : {}
  return writeAndReturn(request, `/catalog/${id}${anchor}`, async () => {
    if (intent === "profile") {
      await medusaSend(`/admin/woodright/products/${id}/profile`, "POST", {
        title: String(form.get("title") ?? ""),
        subtitle: String(form.get("subtitle") ?? ""),
        description: String(form.get("description") ?? ""),
      })
      return
    }
    if (intent === "dimensions") {
      const numberOrNull = (name: string) => {
        const raw = String(form.get(name) ?? "").trim()
        if (!raw) return null
        return Number(raw.replace(",", "."))
      }
      await medusaSend(`/admin/woodright/products/${id}/dimensions`, "POST", {
        height_cm: numberOrNull("height_cm"),
        width_cm: numberOrNull("width_cm"),
        depth_cm: numberOrNull("depth_cm"),
      })
      return
    }
    if (intent === "publish") {
      const saved = await medusaSend<{ product?: { title?: string } }>(
        `/admin/woodright/products/${id}/publish`,
        "POST",
        {}
      )
      return { storefront: await probeTitle(id, saved.product?.title ?? null) }
    }
    if (intent === "unpublish") {
      await medusaSend(`/admin/woodright/products/${id}/unpublish`, "POST", {})
      return { storefront: "skipped" }
    }
    if (intent === "price") {
      const create = form.get("create") === "1"
      const amount = Number(String(form.get("amount") ?? "").replace(/\s/g, ""))
      await medusaSend(`/admin/woodright/products/${id}/price`, "POST", {
        variant_id: String(form.get("variant_id") ?? ""),
        amount,
        expected_amount: create ? undefined : Number(form.get("expected_amount")),
        confirm: form.get("confirm") === "1",
        create,
        currency: "rub",
      })
      return { storefront: await probeBuyerPrice(id, amount) }
    }
    if (intent === "classification") {
      await medusaSend(`/admin/woodright/products/${id}/classification`, "POST", {
        classification: String(form.get("classification") ?? ""),
        confirm: form.get("confirm") === "1",
      })
      return
    }
    if (intent === "reorder" || intent === "detach") {
      await medusaSend(`/admin/woodright/products/${id}/media`, "POST", {
        action: intent === "reorder" ? "reorder" : "detach",
        url: String(form.get("url") ?? ""),
        direction: String(form.get("direction") ?? ""),
        expected: String(form.get("expected") ?? ""),
      })
      return
    }
    if (intent === "hero") {
      await medusaSend(`/admin/woodright/products/${id}/media`, "POST", {
        thumbnail_url: String(form.get("thumbnail_url") ?? ""),
      })
      return
    }
    if (intent === "promo") {
      const amount = form.get("remove") === "1" ? null : Number(String(form.get("amount") ?? "").replace(/\s/g, ""))
      await medusaSend(`/admin/woodright/products/${id}/promo-price`, "POST", {
        variant_id: String(form.get("variant_id") ?? ""),
        amount: amount ?? undefined,
        remove: form.get("remove") === "1",
      })
      return { storefront: await probeBuyerPrice(id, amount) }
    }
  }, keep)
}

async function probeTitle(productId: string, title: string | null) {
  const base = process.env.WOODRIGHT_STOREFRONT_INTERNAL_URL?.replace(/\/$/, "")
  if (!base || !title) return "skipped" as const
  try {
    const response = await fetch(`${base}/product/${encodeURIComponent(productId)}`, {
      cache: "no-store",
      signal: AbortSignal.timeout(5000),
    })
    if (!response.ok) return "miss" as const
    const html = await response.text()
    return html.includes(title) ? "match" as const : "miss" as const
  } catch {
    return "miss" as const
  }
}
