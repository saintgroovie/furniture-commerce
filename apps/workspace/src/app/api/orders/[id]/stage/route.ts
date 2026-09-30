import { medusaSend } from "@/server/medusa"
import { writeAndReturn } from "@/server/write"

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params
  const form = await request.formData()
  const toStage = String(form.get("to_stage") ?? "")
  const expected = Number(form.get("expected_version"))
  const correction = form.get("correction") === "1"
  const correctionReason = String(form.get("correction_reason") ?? "")
  return writeAndReturn(request, `/orders/${id}`, async () => {
    await medusaSend(`/admin/woodright/order-processes/${id}/transitions`, "POST", {
      to_stage: toStage,
      expected_version: expected,
      correction,
      correction_reason: correction ? correctionReason : null,
      notify_customer: false,
    })
  })
}
