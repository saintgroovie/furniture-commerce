import { MedusaService } from "@medusajs/framework/utils"
import { ProductClassification } from "./models/product-type"

class ProductExtensionModuleService extends MedusaService({
  ProductClassification,
}) {}

export default ProductExtensionModuleService
