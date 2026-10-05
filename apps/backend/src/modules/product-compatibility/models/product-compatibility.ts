import { model } from "@medusajs/framework/utils"

/**
 * One canonical accessory ↔ product link.
 * The accessory stays its own cart item. Nothing is inferred from collection.
 */
export const ProductCompatibility = model.define("product_compatibility", {
  id: model.id().primaryKey(),
  accessory_product_id: model.text(),
  product_id: model.text(),
})
