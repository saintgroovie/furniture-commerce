import { model } from "@medusajs/framework/utils"

/** Index row. Body is not stored. */
export const CommMessage = model.define("woodright_comm_message", {
  id: model.id().primaryKey(),
  thread_id: model.text(),
  provider: model.text(),
  mailbox: model.text(),
  provider_message_id: model.text(),
  direction: model.enum(["inbound", "outbound"]),
  sender: model.text().nullable(),
  recipients_json: model.text().nullable(),
  occurred_at: model.dateTime(),
  folder: model.text().nullable(),
  uid: model.text().nullable(),
  uid_validity: model.text().nullable(),
  rfc_message_id: model.text().nullable(),
  in_reply_to: model.text().nullable(),
  references_json: model.text().nullable(),
  content_state: model.enum(["metadata_only", "cached", "unavailable"]).default("metadata_only"),
})
