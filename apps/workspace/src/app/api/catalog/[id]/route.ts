import { medusaSend } from "@/server/medusa"
import { writeAndReturn } from "@/server/write"

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params
  const form = await request.formData()
  const intent = String(form.get("intent") ?? "")
  return writeAndReturn(request, `/catalog/${id}`, async () => {
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
      await medusaSend(`/admin/woodright/products/${id}/publish`, "POST", {})
      return
    }
    if (intent === "unpublish") {
      await medusaSend(`/admin/woodright/products/${id}/unpublish`, "POST", {})
      return
    }
    if (intent === "price") {
      await medusaSend(`/admin/woodright/products/${id}/price`, "POST", {
        variant_id: String(form.get("variant_id") ?? ""),
        amount: Number(String(form.get("amount") ?? "").replace(/\s/g, "")),
        expected_amount: Number(form.get("expected_amount")),
        confirm: form.get("confirm") === "1",
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
      await medusaSend(`/admin/woodright/products/${id}/promo-price`, "POST", {
        variant_id: String(form.get("variant_id") ?? ""),
        amount: form.get("remove") === "1" ? undefined : Number(String(form.get("amount") ?? "").replace(/\s/g, "")),
        remove: form.get("remove") === "1",
      })
    }
  })
}
