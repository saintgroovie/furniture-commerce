import { MedusaService } from "@medusajs/framework/utils"
import { ProductType } from "./models/product-type"

class ProductExtensionModuleService extends MedusaService({
  ProductType,
}) {}

export default ProductExtensionModuleService
