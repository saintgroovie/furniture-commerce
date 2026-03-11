import { defineLink } from "@medusajs/framework/utils"
import ProductModule from "@medusajs/medusa/product"
import RoomSetModule from "../modules/room-set"

/**
 * Link: Product (1) <-> (many) RoomSetItem.
 * One product can appear in many room set items; each room set item references one product.
 * Use isList: true on Product side so that one product can be linked to many room_set_items.
 */
export default defineLink(
  {
    linkable: ProductModule.linkable.product,
    isList: true,
  },
  RoomSetModule.linkable.roomSetItem
)
