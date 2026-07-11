import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { ROOM_SET_MODULE } from "../../../../modules/room-set"
import RoomSetModuleService from "../../../../modules/room-set/service"

/** Opt-in lean projection for catalog kids membership (product ids only). */
const PRODUCT_IDS_VIEW = "product_ids"

/**
 * Opt-in storefront room detail: title + type + first-variant ids for CTA.
 * Default detail (`product.*` / `variants.*`) stays for other consumers.
 */
const STOREFRONT_VIEW = "storefront"

export async function GET(req: MedusaRequest, res: MedusaResponse) {
  const slug = req.params.slug as string
  const viewRaw = req.query?.view
  const view =
    typeof viewRaw === "string"
      ? viewRaw
      : Array.isArray(viewRaw)
        ? String(viewRaw[0] ?? "")
        : ""

  const roomSetService = req.scope.resolve(ROOM_SET_MODULE) as RoomSetModuleService

  // Default detail contract matches main: slug only (no is_active filter).
  // Lean membership may optionally prefer active sets.
  const listFilter =
    view === PRODUCT_IDS_VIEW ? { slug, is_active: true } : { slug }

  const list = await roomSetService.listRoomSets(listFilter, { take: 1 })
  const roomSet = list[0]
  if (!roomSet) {
    res.status(404).json({ message: "Room set not found" })
    return
  }
  const query = req.scope.resolve("query") as {
    graph: (args: {
      entity: string
      fields: string[]
      filters?: Record<string, unknown>
    }) => Promise<{ data: unknown[] }>
  }

  if (view === PRODUCT_IDS_VIEW) {
    const { data: itemsLean } = await query.graph({
      entity: "room_set_item",
      fields: ["id", "sort_order", "products.id"],
      filters: { room_set_id: roomSet.id },
    })
    const items: Array<Record<string, unknown> & { product: { id: string } }> =
      []
    for (const row of itemsLean ?? []) {
      const item = row as Record<string, unknown> & {
        sort_order?: number
        products?: Array<{ id?: string }>
      }
      const productId = item.products?.[0]?.id
      if (typeof productId !== "string" || !productId) {
        res.status(500).json({
          message: "Room set item missing product id (product_ids view)",
        })
        return
      }
      const { products: _products, ...rest } = item
      items.push({ ...rest, product: { id: productId } })
    }
    items.sort(
      (a, b) => ((a.sort_order as number) ?? 0) - ((b.sort_order as number) ?? 0)
    )
    res.json({ room_set: { ...roomSet, items } })
    return
  }

  if (view === STOREFRONT_VIEW) {
    const { data: itemsStorefront } = await query.graph({
      entity: "room_set_item",
      fields: [
        "id",
        "quantity",
        "sort_order",
        "product.id",
        "product.title",
        "product.product_classification.product_type",
        "product.variants.id",
      ],
      filters: { room_set_id: roomSet.id },
    })
    const items = ((itemsStorefront ?? []) as Array<Record<string, unknown>>).map(
      (row) => {
        const product = row.product as Record<string, unknown> | undefined
        if (!product || typeof product !== "object") return row
        const variantsRaw = product.variants
        const variants = Array.isArray(variantsRaw)
          ? variantsRaw
              .map((v) => {
                if (!v || typeof v !== "object") return null
                const id = (v as { id?: unknown }).id
                return typeof id === "string" ? { id } : null
              })
              .filter((v): v is { id: string } => v != null)
              .slice(0, 1)
          : []
        const classification = product.product_classification as
          | { product_type?: unknown }
          | undefined
        return {
          id: row.id,
          quantity: row.quantity,
          sort_order: row.sort_order,
          product: {
            id: product.id,
            title: product.title,
            product_classification:
              classification && typeof classification.product_type === "string"
                ? { product_type: classification.product_type }
                : undefined,
            variants,
          },
        }
      }
    )
    items.sort(
      (a, b) =>
        ((a.sort_order as number) ?? 0) - ((b.sort_order as number) ?? 0)
    )
    res.json({ room_set: { ...roomSet, items } })
    return
  }

  // Default detail: product + Woodright classification + variants.
  const { data: itemsWithProduct } = await query.graph({
    entity: "room_set_item",
    fields: [
      "*",
      "product.*",
      "product.product_classification.*",
      "product.variants.*",
    ],
    filters: { room_set_id: roomSet.id },
  })
  const items = (itemsWithProduct ?? []) as Array<
    Record<string, unknown> & { sort_order?: number }
  >
  items.sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0))
  res.json({ room_set: { ...roomSet, items } })
}
