import { model } from "@medusajs/framework/utils"

export const ProductType = model.define("product_type", {
  id: model.id().primaryKey(),
  product_type: model.enum(["STANDARD", "CONFIGURABLE", "BESPOKE"]),
})
