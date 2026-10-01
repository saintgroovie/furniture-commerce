import { model } from "@medusajs/framework/utils"

export const CommThread = model.define("woodright_comm_thread", {
  id: model.id().primaryKey(),
  channel: model.text().default("email"),
  mailbox: model.text().nullable(),
  subject: model.text().nullable(),
  status: model.enum(["open", "waiting", "closed"]).default("open"),
  waiting_on: model.enum(["us", "client", "nobody"]).default("us"),
  assignee_id: model.text().nullable(),
  lead_id: model.text().nullable(),
  company_id: model.text().nullable(),
  request_id: model.text().nullable(),
  order_id: model.text().nullable(),
  project_id: model.text().nullable(),
  last_message_at: model.dateTime().nullable(),
})
