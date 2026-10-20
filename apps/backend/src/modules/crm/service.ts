import { MedusaService } from "@medusajs/framework/utils";
import { FollowUp } from "./models/follow-up";
import { PrivateAttachment } from "./models/private-attachment";

class CrmModuleService extends MedusaService({ FollowUp, PrivateAttachment }) {}
export default CrmModuleService;
