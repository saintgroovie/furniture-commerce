import { Module } from "@medusajs/framework/utils"
import CommunicationModuleService from "./service"

export const COMMUNICATION_MODULE = "communicationModuleService"

export default Module(COMMUNICATION_MODULE, {
  service: CommunicationModuleService,
})
