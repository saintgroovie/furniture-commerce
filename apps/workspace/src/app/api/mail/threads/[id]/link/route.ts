import { medusaSend } from "@/server/medusa"
import { writeAndReturn } from "@/server/write"

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params
  const form = await request.formData()
  const leadId = String(form.get("lead_id") ?? "")
  return writeAndReturn(request, `/inbox/${id}`, async () => {
    await medusaSend(`/admin/woodright/mail/threads/${encodeURIComponent(id)}/link`, "POST", {
      lead_id: leadId,
    })
  })
}
