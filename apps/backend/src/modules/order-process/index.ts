import { Module } from "@medusajs/framework/utils"
import OrderProcessModuleService from "./service"

export const ORDER_PROCESS_MODULE = "orderProcessModuleService"

export default Module(ORDER_PROCESS_MODULE, {
  service: OrderProcessModuleService,
})
