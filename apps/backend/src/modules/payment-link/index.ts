import { Module } from "@medusajs/framework/utils"
import PaymentLinkModuleService from "./service"

export const PAYMENT_LINK_MODULE = "paymentLinkModuleService"

export default Module(PAYMENT_LINK_MODULE, {
  service: PaymentLinkModuleService,
})
