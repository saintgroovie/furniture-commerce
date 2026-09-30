import { MedusaService } from "@medusajs/framework/utils"
import { PersonLink } from "./models/person-link"

class PersonLinkModuleService extends MedusaService({
  PersonLink,
}) {}

export default PersonLinkModuleService
