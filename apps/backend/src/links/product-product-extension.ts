import { defineLink } from "@medusajs/framework/utils"
import ProductModule from "@medusajs/medusa/product"
import ProductExtensionModule from "../modules/product-extension"

// Связь Product ↔ ProductClassification предполагается one-to-one на уровне бизнес-правила и seed/сервисов.
export default defineLink(
  ProductModule.linkable.product,
  ProductExtensionModule.linkable.productClassification
)
