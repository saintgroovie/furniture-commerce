import { model } from "@medusajs/framework/utils";

export const PrivateAttachment = model.define("woodright_private_attachment", {
  id: model.id().primaryKey(),
  entity_type: model.enum(["person", "request", "order"]),
  entity_id: model.text(),
  filename: model.text(),
  mime_type: model.text(),
  size: model.number(),
  sha256: model.text(),
  storage_key: model.text(),
  uploaded_by: model.text(),
});
