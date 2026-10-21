import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http";
import {
  deskContext,
  deskFailure,
} from "../../../../../lib/woodright-desk/http";
import { PrivateFileStore } from "../../../../../lib/woodright-desk/private-files";
export async function GET(req: MedusaRequest, res: MedusaResponse) {
  try {
    await deskContext(req);
    let attachments = false;
    if (process.env.WOODRIGHT_PRIVATE_FILES_ROOT) {
      await new PrivateFileStore(
        process.env.WOODRIGHT_PRIVATE_FILES_ROOT,
      ).directory();
      attachments = true;
    }
    res.setHeader("Cache-Control", "private, no-store");
    res.json({
      contract: "woodright-desk-v1",
      requestUpdate: true,
      crmCreate: true,
      personUpdate: true,
      history: true,
      reminders: true,
      attachments,
      maxAttachmentBytes: 8 * 1024 * 1024,
    });
  } catch (e) {
    deskFailure(res, e);
  }
}
