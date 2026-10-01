import { model } from "@medusajs/framework/utils"

export const MailCheckpoint = model.define("woodright_mail_checkpoint", {
  id: model.id().primaryKey(),
  mailbox: model.text(),
  folder: model.text(),
  uid_validity: model.text(),
  last_uid: model.number().default(0),
})
