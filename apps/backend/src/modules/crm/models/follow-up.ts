import { model } from "@medusajs/framework/utils"

export const FollowUp = model.define("woodright_follow_up", {
  id: model.id().primaryKey(),
  entity_type: model.enum(["person", "request", "company", "order"]),
  entity_id: model.text(),
  assignee_id: model.text().nullable(),
  due_at: model.dateTime(),
  summary: model.text(),
  status: model.enum(["open", "done", "cancelled"]).default("open"),
  created_by: model.text().nullable(),
})
