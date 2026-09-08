import { Module } from "@medusajs/framework/utils"
import PromotionSlotModuleService from "./service"

export const PROMOTION_SLOT_MODULE = "promotionSlotModuleService"

export default Module(PROMOTION_SLOT_MODULE, {
  service: PromotionSlotModuleService,
})
