import { MedusaService } from "@medusajs/framework/utils"
import { CommAttachment } from "./models/attachment"
import { MailCheckpoint } from "./models/checkpoint"
import { MailConnection } from "./models/connection"
import { CommMessage } from "./models/message"
import { CommThread } from "./models/thread"

class CommunicationModuleService extends MedusaService({
  CommThread,
  CommMessage,
  CommAttachment,
  MailCheckpoint,
  MailConnection,
}) {}

export default CommunicationModuleService
