import { model } from "@medusajs/framework/utils"

/** No token columns. Credentials stay outside the database until an owner gate. */
export const MailConnection = model.define("woodright_mail_connection", {
  id: model.id().primaryKey(),
  provider: model.text().default("yandex"),
  mailbox: model.text(),
  status: model.enum(["disabled", "configured", "error"]).default("disabled"),
})
