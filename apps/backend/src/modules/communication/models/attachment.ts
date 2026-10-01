import { model } from "@medusajs/framework/utils"

/** Provider reference only. The blob stays at Yandex. */
export const CommAttachment = model.define("woodright_comm_attachment", {
  id: model.id().primaryKey(),
  message_id: model.text(),
  filename: model.text().nullable(),
  mime: model.text().nullable(),
  size: model.number().nullable(),
  provider_ref: model.text().nullable(),
})
