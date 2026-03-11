import { MedusaService } from "@medusajs/framework/utils"
import { PaymentLink } from "./models/payment-link"

class PaymentLinkModuleService extends MedusaService({
  PaymentLink,
}) {}

export default PaymentLinkModuleService
