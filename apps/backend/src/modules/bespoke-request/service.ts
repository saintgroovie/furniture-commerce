import { MedusaService } from "@medusajs/framework/utils"
import { BespokeRequest } from "./models/bespoke-request"

class BespokeRequestModuleService extends MedusaService({
  BespokeRequest,
}) {}

export default BespokeRequestModuleService
