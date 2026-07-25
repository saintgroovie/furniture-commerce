import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { exactlyOneProduct } from "../../../../lib/room-set-item-product"
import { ROOM_SET_MODULE } from "../../../../modules/room-set"
import RoomSetModuleService from "../../../../modules/room-set/service"

/** Opt-in lean projection for catalog kids membership (product ids only). */
const PRODUCT_IDS_VIEW = "product_ids"

/**
 * Opt-in storefront room detail: title + type + first-variant ids for CTA.
 * Default detail (`products.*` / `variants.*`) stays for other consumers.
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
      const one = exactlyOneProduct(item.products)
      if (!one.ok || typeof one.product.id !== "string" || !one.product.id) {
        res.status(500).json({
          message:
            one.ok === false && one.reason === "ambiguous"
              ? "Room set item has multiple product links (product_ids view)"
              : "Room set item missing product id (product_ids view)",
        })
        return
      }
      const { products: _products, ...rest } = item
      items.push({ ...rest, product: { id: one.product.id } })
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
        "products.id",
        "products.title",
        "products.handle",
        "products.product_classification.product_type",
        "products.variants.id",
      ],
      filters: { room_set_id: roomSet.id },
    })
    const items: Array<Record<string, unknown>> = []
    for (const row of (itemsStorefront ?? []) as Array<Record<string, unknown>>) {
      const products = row.products as Array<Record<string, unknown>> | undefined
      const one = exactlyOneProduct(products)
      if (!one.ok) {
        res.status(500).json({
          message:
            one.reason === "ambiguous"
              ? "Room set item has multiple product links (storefront view)"
              : "Room set item missing product link (storefront view)",
        })
        return
      }
      const product = one.product
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
      items.push({
        id: row.id,
        quantity: row.quantity,
        sort_order: row.sort_order,
        product: {
          id: product.id,
          title: product.title,
          handle: product.handle,
          product_classification:
            classification && typeof classification.product_type === "string"
              ? { product_type: classification.product_type }
              : undefined,
          variants,
        },
      })
    }
    items.sort(
      (a, b) =>
        ((a.sort_order as number) ?? 0) - ((b.sort_order as number) ?? 0)
    )
    res.json({ room_set: { ...roomSet, items } })
    return
  }

  // Default detail: product + classification + variants.
  const { data: itemsWithProduct } = await query.graph({
    entity: "room_set_item",
    fields: [
      "*",
      "products.*",
      "products.product_classification.*",
      "products.variants.*",
    ],
    filters: { room_set_id: roomSet.id },
  })
  const items: Array<Record<string, unknown> & { sort_order?: number }> = []
  for (const row of (itemsWithProduct ?? []) as Array<Record<string, unknown>>) {
    const one = exactlyOneProduct(row.products as unknown[] | undefined)
    if (!one.ok) {
      res.status(500).json({
        message:
          one.reason === "ambiguous"
            ? "Room set item has multiple product links"
            : "Room set item missing product link",
      })
      return
    }
    const { products: _drop, ...rest } = row
    items.push({
      ...rest,
      product: one.product,
    } as Record<string, unknown> & { sort_order?: number })
  }
  items.sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0))
  res.json({ room_set: { ...roomSet, items } })
}
