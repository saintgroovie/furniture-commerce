import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { mailConnectorEnabled } from "../../../../../../../lib/woodright-workspace/mail-boundary"
import { requireDeskWrite } from "../../../../../../../lib/woodright-workspace/require-desk-write"

/**
 * The live connector stays off. This route cannot open SMTP.
 * Acceptance and rejection are covered by deliverStaffText and the test double.
 */
export async function POST(req: MedusaRequest, res: MedusaResponse) {
  const gate = await requireDeskWrite(req, res, "mail.reply")
  if (!gate) return
  if (!mailConnectorEnabled()) {
    res.status(409).json({
      code: "connector_disabled",
      message: "Письмо не отправлено. Почта не подключена",
    })
    return
  }
  res.status(409).json({ code: "connector_disabled", message: "Письмо не отправлено. Почта не подключена" })
}
