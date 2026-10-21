import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http";
import {
  deskContext,
  deskFailure,
} from "../../../../../lib/woodright-desk/http";
import { PrivateFileStore } from "../../../../../lib/woodright-desk/private-files";
import { teamInstalled } from "../../../../../lib/woodright-desk/team";
import { roleCapabilities } from "../../../../../lib/woodright-desk/staff-access";
export async function GET(req: MedusaRequest, res: MedusaResponse) {
  try {
    const { sql, access } = await deskContext(req);
    const team = await teamInstalled(sql);
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
      maxAttachmentBytes: 8 * 1024 * 1024,
      ...roleCapabilities(access.role),
      companies: team && roleCapabilities(access.role).companies,
      assignments: team && roleCapabilities(access.role).assignments,
      attachments,
    });
  } catch (e) {
    deskFailure(res, e);
  }
}
