import { MedusaService } from "@medusajs/framework/utils"
import { ProductSalesPolicy } from "./models/product-sales-policy"

class ProductSalesModuleService extends MedusaService({
  ProductSalesPolicy,
}) {}

export default ProductSalesModuleService
