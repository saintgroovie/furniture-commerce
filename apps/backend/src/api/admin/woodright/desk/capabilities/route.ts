import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http";
import {
  deskContext,
  deskFailure,
} from "../../../../../lib/woodright-desk/http";
import { PrivateFileStore } from "../../../../../lib/woodright-desk/private-files";
import { teamInstalled } from "../../../../../lib/woodright-desk/team";
export async function GET(req: MedusaRequest, res: MedusaResponse) {
  try {
    const {sql}=await deskContext(req);
    const team=await teamInstalled(sql);
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
      companies: team,
      assignments: team,
      history: true,
      reminders: true,
      attachments,
      maxAttachmentBytes: 8 * 1024 * 1024,
    });
  } catch (e) {
    deskFailure(res, e);
  }
}
