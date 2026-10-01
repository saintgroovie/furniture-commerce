import { MedusaService } from "@medusajs/framework/utils"
import { Company } from "./models/company"
import { FollowUp } from "./models/follow-up"
import { PersonCompany } from "./models/person-company"
import { PersonNote } from "./models/person-note"
import { PersonRoleRow } from "./models/person-role"
import { RequestOrder } from "./models/request-order"

class CrmModuleService extends MedusaService({
  Company,
  PersonCompany,
  PersonRoleRow,
  FollowUp,
  PersonNote,
  RequestOrder,
}) {}

export default CrmModuleService
