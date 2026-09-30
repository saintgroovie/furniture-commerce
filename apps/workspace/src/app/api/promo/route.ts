import { medusaGet, medusaSend } from "@/server/medusa"
import { writeAndReturn } from "@/server/write"

type PromoState = {
  slot: { product_ids: string[]; enabled: boolean }
}

export async function POST(request: Request) {
  const form = await request.formData()
  return writeAndReturn(request, "/promo", async () => {
    const current = await medusaGet<PromoState>("/admin/woodright/catalog-promo")
    const ids = [...current.slot.product_ids]
    const add = String(form.get("add_product_id") ?? "").trim()
    const remove = String(form.get("remove_product_id") ?? "").trim()
    const enabledRaw = form.get("enabled")
    const nextIds = remove ? ids.filter((id) => id !== remove) : add && !ids.includes(add) ? [...ids, add] : ids
    const body: { product_ids?: string[]; enabled?: boolean } = {}
    if (add || remove) body.product_ids = nextIds
    if (enabledRaw === "1" || enabledRaw === "0") body.enabled = enabledRaw === "1"
    if (!body.product_ids && body.enabled == null) return
    await medusaSend("/admin/woodright/catalog-promo", "PUT", body)
  })
}
