import { Module } from "@medusajs/framework/utils"
import CrmModuleService from "./service"

export const CRM_MODULE = "crmModuleService"

export default Module(CRM_MODULE, {
  service: CrmModuleService,
})
