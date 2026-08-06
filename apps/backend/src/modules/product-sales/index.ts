import { Module } from "@medusajs/framework/utils"
import ProductSalesModuleService from "./service"

export const PRODUCT_SALES_MODULE = "productSalesModuleService"

export default Module(PRODUCT_SALES_MODULE, {
  service: ProductSalesModuleService,
})
