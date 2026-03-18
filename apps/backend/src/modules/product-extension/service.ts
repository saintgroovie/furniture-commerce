import { MedusaService } from "@medusajs/framework/utils"
import { ProductClassification } from "./models/product-classification"

class ProductExtensionModuleService extends MedusaService({
  ProductClassification,
}) {}

export default ProductExtensionModuleService
