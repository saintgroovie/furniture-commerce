import { model } from "@medusajs/framework/utils"

export const ProductClassification = model.define("product_classification", {
  id: model.id().primaryKey(),
  product_type: model.enum(["STANDARD", "CONFIGURABLE", "BESPOKE"]),
})
