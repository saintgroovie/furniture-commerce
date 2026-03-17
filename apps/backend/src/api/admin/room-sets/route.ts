import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { ROOM_SET_MODULE } from "../../../modules/room-set"

export async function GET(req: MedusaRequest, res: MedusaResponse) {
  const roomSetService = req.scope.resolve(ROOM_SET_MODULE) as any
  const list = await roomSetService.listRoomSets({}, { order: { created_at: "DESC" } })
  res.json({ room_sets: list })
}

export async function POST(req: MedusaRequest, res: MedusaResponse) {
  const body = req.body as {
    title: string
    slug: string
    description?: string
    hero_image?: string
    gallery?: unknown
    price_from?: number
    room_type?: string
    style?: string
    is_active?: boolean
  }
  const roomSetService = req.scope.resolve(ROOM_SET_MODULE) as any
  const [roomSet] = await roomSetService.createRoomSets({
    title: body.title,
    slug: body.slug,
    description: body.description ?? null,
    hero_image: body.hero_image ?? null,
    gallery: body.gallery ?? null,
    price_from: body.price_from ?? null,
    room_type: body.room_type ?? null,
    style: body.style ?? null,
    is_active: body.is_active ?? true,
  })
  res.status(201).json({ room_set: roomSet })
}
