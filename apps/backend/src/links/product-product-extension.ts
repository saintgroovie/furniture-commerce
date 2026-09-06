import { defineLink } from "@medusajs/framework/utils"
import ProductModule from "@medusajs/medusa/product"
import ProductExtensionModule from "../modules/product-extension"

// Product ↔ ProductClassification is one-to-one at the business / seed layer.
export default defineLink(
  ProductModule.linkable.product,
  ProductExtensionModule.linkable.productClassification
)
