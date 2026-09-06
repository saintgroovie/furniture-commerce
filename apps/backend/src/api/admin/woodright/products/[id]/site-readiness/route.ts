import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import path from "node:path"
import { ROOM_SET_MODULE } from "../../../../../../modules/room-set"
import RoomSetModuleService from "../../../../../../modules/room-set/service"
import { KIDS_ROOM_TYPE } from "../../../../../../lib/woodright-admin/kids-metadata"
import {
  computeSiteReadiness,
  type RoomSetContext,
} from "../../../../../../lib/woodright-admin/site-readiness"

async function resolveRoomSetContext(
  req: MedusaRequest,
  productId: string
): Promise<RoomSetContext> {
  const roomSetService = req.scope.resolve(ROOM_SET_MODULE) as RoomSetModuleService
  const query = req.scope.resolve("query") as {
    graph: (args: {
      entity: string
      fields: string[]
      filters?: Record<string, unknown>
    }) => Promise<{ data: unknown[] }>
  }

  const roomSets = await roomSetService.listRoomSets({ is_active: true })
  const slugs: string[] = []
  let inKidsRoomSet = false
  let inNonKidsRoomSet = false

  for (const rs of roomSets) {
    const { data: items } = await query.graph({
      entity: "room_set_item",
      fields: ["id", "room_set_id", "products.id"],
      filters: { room_set_id: rs.id },
    })
    const hasProduct = (items ?? []).some((row) => {
      const item = row as { products?: Array<{ id?: string }> }
      return item.products?.some((p) => p.id === productId) ?? false
    })
    if (!hasProduct) continue
    if (rs.slug) slugs.push(rs.slug)
    if (rs.room_type === KIDS_ROOM_TYPE) inKidsRoomSet = true
    else inNonKidsRoomSet = true
  }

  return { inKidsRoomSet, inNonKidsRoomSet, roomSetSlugs: slugs }
}

/**
 * Read-only Woodright storefront summary for Medusa Admin.
 * GET /admin/woodright/products/:id/site-readiness
 */
export async function GET(req: MedusaRequest, res: MedusaResponse) {
  const id = req.params.id as string
  const query = req.scope.resolve("query") as {
    graph: (args: {
      entity: string
      fields: string[]
      filters?: Record<string, unknown>
    }) => Promise<{ data: unknown[] }>
  }

  const { data } = await query.graph({
    entity: "product",
    fields: [
      "id",
      "handle",
      "title",
      "status",
      "thumbnail",
      "metadata",
      "images.*",
      "variants.id",
      "variants.sku",
      "variants.thumbnail",
      "product_classification.*",
    ],
    filters: { id },
  })

  const product = data?.[0] as Record<string, unknown> | undefined
  if (!product) {
    res.status(404).json({ message: "Product not found" })
    return
  }

  const roomContext = await resolveRoomSetContext(req, id)
  const backendRoot = path.resolve(process.cwd())

  const summary = computeSiteReadiness(product, {
    roomContext,
    backendRoot,
    checkStaticFiles: true,
  })

  res.json(summary)
}
