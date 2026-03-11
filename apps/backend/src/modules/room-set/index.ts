import { Module } from "@medusajs/framework/utils"
import RoomSetModuleService from "./service"

export const ROOM_SET_MODULE = "roomSetModuleService"

export default Module(ROOM_SET_MODULE, {
  service: RoomSetModuleService,
})
