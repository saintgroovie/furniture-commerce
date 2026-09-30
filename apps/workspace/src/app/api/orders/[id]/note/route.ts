import { medusaSend } from "@/server/medusa"
import { writeAndReturn } from "@/server/write"

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params
  const form = await request.formData()
  const note = String(form.get("internal_note") ?? "")
  const expected = Number(form.get("expected_version"))
  return writeAndReturn(request, `/orders/${id}`, async () => {
    await medusaSend(`/admin/woodright/order-processes/${id}/note`, "POST", {
      internal_note: note,
      expected_version: expected,
    })
  }, { note })
}
