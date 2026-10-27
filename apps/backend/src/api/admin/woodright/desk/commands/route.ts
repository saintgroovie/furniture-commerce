import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http";
import { createOrderFromRequest } from "../../../../../lib/woodright-desk/orders";
import { orderPorts } from "../../../../../lib/woodright-desk/orders-runtime";
import { executeDeskCommand } from "../../../../../lib/woodright-desk/commands";
import {
  deskContext,
  deskFailure,
} from "../../../../../lib/woodright-desk/http";
import {
  attachFile,
  removeAttachment,
  restoreAttachment,
  PrivateFileStore,
} from "../../../../../lib/woodright-desk/private-files";
import {
  authorizeDeskCommand,
  parseStaffAccess,
} from "../../../../../lib/woodright-desk/staff-access";
export async function POST(req: MedusaRequest, res: MedusaResponse) {
  try {
    const { sql, actorId, access } = await deskContext(req);
    const command = (req.body ?? {}) as Record<string, any>;
    const result = await sql.transaction(async (trx) => {
      const user = (
        await trx.raw(
          'select * from "user" where id = ? and deleted_at is null for share',
          [actorId],
        )
      ).rows[0];
      const currentAccess = parseStaffAccess(user);
      if (
        command.type === "attachment.upload" &&
        command.visibility === undefined
      )
        command.visibility =
          currentAccess.role === "production" ? "assigned" : "business";
      await authorizeDeskCommand(trx, currentAccess, command);
      if (command.type === "order.create") {
        return createOrderFromRequest(
          trx,
          actorId,
          command,
          orderPorts(req.scope, trx),
        );
      }
      return command.type === "attachment.upload"
        ? await attachFile(
            trx,
            actorId,
            command,
            new PrivateFileStore(
              process.env.WOODRIGHT_PRIVATE_FILES_ROOT || "",
            ),
          )
        : command.type === "attachment.remove"
          ? await removeAttachment(trx, actorId, command)
          : command.type === "attachment.restore"
            ? await restoreAttachment(
                trx,
                actorId,
                command,
                new PrivateFileStore(
                  process.env.WOODRIGHT_PRIVATE_FILES_ROOT || "",
                ),
              )
            : await executeDeskCommand(trx, actorId, command);
    });
    res.setHeader("Cache-Control", "private, no-store");
    res.json({ ok: true, result });
  } catch (e) {
    deskFailure(res, e);
  }
}
