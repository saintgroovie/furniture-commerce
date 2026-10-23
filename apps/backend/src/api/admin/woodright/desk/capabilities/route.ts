import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http";
import {
  deskContext,
  deskFailure,
} from "../../../../../lib/woodright-desk/http";
import { PrivateFileStore } from "../../../../../lib/woodright-desk/private-files";
import { teamInstalled } from "../../../../../lib/woodright-desk/team";
import { roleCapabilities } from "../../../../../lib/woodright-desk/staff-access";
import { invoicesInstalled } from "../../../../../lib/woodright-desk/invoices";
export async function GET(req: MedusaRequest, res: MedusaResponse) {
  try {
    const { sql, access } = await deskContext(req);
    const team = await teamInstalled(sql);
    const invoices = team && (await invoicesInstalled(sql));
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
      invoiceRead: invoices && roleCapabilities(access.role).invoiceRead,
      invoiceDraft: invoices && roleCapabilities(access.role).invoiceDraft,
      invoiceRegister:
        invoices && roleCapabilities(access.role).invoiceRegister,
      fileVisibility: invoices,
      attachments,
    });
  } catch (e) {
    deskFailure(res, e);
  }
}
