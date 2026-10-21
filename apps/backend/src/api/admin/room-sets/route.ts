import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http";
import { ROOM_SET_MODULE } from "../../../modules/room-set";
import RoomSetModuleService from "../../../modules/room-set/service";
import { page, deskFailure } from "../../../lib/woodright-desk/http";

export async function GET(req: MedusaRequest, res: MedusaResponse) {
  const roomSetService = req.scope.resolve(
    ROOM_SET_MODULE,
  ) as RoomSetModuleService;
  try {
    const { limit, offset } = page(req.query);
    const [list, count] = await roomSetService.listAndCountRoomSets(
      {},
      { take: limit, skip: offset, order: { created_at: "DESC", id: "ASC" } },
    );
    res.json({ room_sets: list, count, limit, offset });
  } catch (error) {
    deskFailure(res, error);
  }
}

export async function POST(req: MedusaRequest, res: MedusaResponse) {
  const body = req.body as {
    title: string;
    slug: string;
    description?: string;
    hero_image?: string;
    gallery?: unknown;
    price_from?: number;
    room_type?: string;
    style?: string;
    is_active?: boolean;
  };
  const roomSetService = req.scope.resolve(
    ROOM_SET_MODULE,
  ) as RoomSetModuleService;
  const created = await roomSetService.createRoomSets({
    title: body.title,
    slug: body.slug,
    description: body.description ?? null,
    hero_image: body.hero_image ?? null,
    gallery: (body.gallery as Record<string, unknown> | null) ?? null,
    price_from: body.price_from ?? null,
    room_type: body.room_type ?? null,
    style: body.style ?? null,
    is_active: body.is_active ?? true,
  });
  const roomSet = Array.isArray(created) ? created[0] : created;
  res.status(201).json({ room_set: roomSet });
}
