import { Module } from "@medusajs/framework/utils"
import BespokeRequestModuleService from "./service"

export const BESPOKE_REQUEST_MODULE = "bespokeRequestModuleService"

export default Module(BESPOKE_REQUEST_MODULE, {
  service: BespokeRequestModuleService,
})
