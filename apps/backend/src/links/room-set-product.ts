import { defineLink } from "@medusajs/framework/utils"
import ProductModule from "@medusajs/medusa/product"
import RoomSetModule from "../modules/room-set"

export default defineLink(
  ProductModule.linkable.product,
  {
    linkable: RoomSetModule.linkable.roomSetItem,
    isList: true,
  }
)
