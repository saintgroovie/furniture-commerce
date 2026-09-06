import { MedusaService } from "@medusajs/framework/utils"
import { WoodrightOrderProcess } from "./models/order-process"
import { WoodrightOrderProcessEvent } from "./models/order-process-event"
import { WoodrightOrderAccess } from "./models/order-access"
import { WoodrightNotificationDelivery } from "./models/notification-delivery"

class OrderProcessModuleService extends MedusaService({
  WoodrightOrderProcess,
  WoodrightOrderProcessEvent,
  WoodrightOrderAccess,
  WoodrightNotificationDelivery,
}) {}

export default OrderProcessModuleService
