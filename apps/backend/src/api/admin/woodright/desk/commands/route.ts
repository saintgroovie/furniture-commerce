import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http";
import { executeDeskCommand } from "../../../../../lib/woodright-desk/commands";
import {
  deskContext,
  deskFailure,
} from "../../../../../lib/woodright-desk/http";
import {
  attachFile,
  removeAttachment,
  PrivateFileStore,
} from "../../../../../lib/woodright-desk/private-files";
export async function POST(req: MedusaRequest, res: MedusaResponse) {
  try {
    const { sql, actorId } = await deskContext(req);
    const command = (req.body ?? {}) as Record<string, any>;
    const result =
      command.type === "attachment.upload"
        ? await attachFile(
            sql,
            actorId,
            command,
            new PrivateFileStore(
              process.env.WOODRIGHT_PRIVATE_FILES_ROOT || "",
            ),
          )
        : command.type === "attachment.remove"
          ? await removeAttachment(sql, actorId, command)
          : await executeDeskCommand(sql, actorId, command);
    res.setHeader("Cache-Control", "private, no-store");
    res.json({ ok: true, result });
  } catch (e) {
    deskFailure(res, e);
  }
}
