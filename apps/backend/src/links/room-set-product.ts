import { defineLink } from "@medusajs/framework/utils"
import ProductModule from "@medusajs/medusa/product"
import RoomSetModule from "../modules/room-set"

/**
 * Link: Product (many) <-> (many) RoomSetItem.
 * One product may appear in many room compositions.
 * Application invariant (seed planner + store/admin normalizers): each
 * room_set_item must still resolve to exactly one product — multi-link is
 * fail-closed. Both sides need isList: true so Link.create allows a second
 * room_set_item for the same product_id (shared SKUs across RoomSets).
 */
export default defineLink(
  {
    linkable: ProductModule.linkable.product,
    isList: true,
  },
  {
    linkable: RoomSetModule.linkable.roomSetItem,
    isList: true,
  }
)
