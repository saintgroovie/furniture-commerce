import { assertEntityAccess } from "../../../../../../../lib/woodright-desk/staff-access";
import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http";
import { createHash } from "node:crypto";
import {
  DeskError,
  entity,
  identifier,
  requireEntity,
} from "../../../../../../../lib/woodright-desk/commands";
import {
  deskContext,
  deskFailure,
} from "../../../../../../../lib/woodright-desk/http";
import { PrivateFileStore } from "../../../../../../../lib/woodright-desk/private-files";
export async function GET(req: MedusaRequest, res: MedusaResponse) {
  try {
    const { sql, access } = await deskContext(req);
    const row = (
      await sql.raw(
        `select * from woodright_private_attachment where id = ? and deleted_at is null`,
        [identifier(req.params.id)],
      )
    ).rows[0];
    if (!row) throw new DeskError(404, "NOT_FOUND", "Вложение не найдено");
    await assertEntityAccess(sql, access, row.entity_type, row.entity_id);
    await sql.transaction(async (trx) => {
      await requireEntity(trx, entity(row.entity_type), row.entity_id);
    });
    const bytes = await new PrivateFileStore(
      process.env.WOODRIGHT_PRIVATE_FILES_ROOT || "",
    ).get(row.storage_key);
    if (
      bytes.length !== row.size ||
      createHash("sha256").update(bytes).digest("hex") !== row.sha256
    )
      throw new DeskError(
        503,
        "FILE_INTEGRITY",
        "Не удалось подтвердить целостность файла",
      );
    res.setHeader("Cache-Control", "private, no-store");
    res.setHeader("Content-Type", "application/octet-stream");
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="document"; filename*=UTF-8''${encodeURIComponent(row.filename).replace(/['()*]/g, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`)}`,
    );
    res.send(bytes);
  } catch (e) {
    deskFailure(res, e);
  }
}
