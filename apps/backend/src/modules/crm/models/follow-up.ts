import { model } from "@medusajs/framework/utils";

// Existing Woodright CRM table/contract, extracted from committed 51f224d1.
export const FollowUp = model.define("woodright_follow_up", {
  id: model.id().primaryKey(),
  entity_type: model.enum(["person", "request", "company", "order"]),
  entity_id: model.text(),
  assignee_id: model.text().nullable(),
  due_at: model.dateTime(),
  summary: model.text(),
  status: model.enum(["open", "done", "cancelled"]).default("open"),
  created_by: model.text().nullable(),
  version: model.number().default(1),
});
