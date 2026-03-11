import { Module } from "@medusajs/framework/utils"
import ProductExtensionModuleService from "./service"

export const PRODUCT_EXTENSION_MODULE = "productExtensionModuleService"

export default Module(PRODUCT_EXTENSION_MODULE, {
  service: ProductExtensionModuleService,
})
