import { defineLink } from "@medusajs/framework/utils"
import ProductModule from "@medusajs/medusa/product"
import ProductSalesModule from "../modules/product-sales"

export default defineLink(
  ProductModule.linkable.product,
  ProductSalesModule.linkable.productSalesPolicy
)
