import { Module } from "@medusajs/framework/utils"
import PersonLinkModuleService from "./service"

export const PERSON_LINK_MODULE = "personLinkModuleService"

export default Module(PERSON_LINK_MODULE, {
  service: PersonLinkModuleService,
})
