import { medusaSend } from "@/server/medusa"
import { writeAndReturn } from "@/server/write"

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params
  const form = await request.formData()
  const raw = String(form.get("assignee_id") ?? "")
  return writeAndReturn(request, `/orders/${id}`, async () => {
    await medusaSend(`/admin/woodright/order-processes/${id}/assignee`, "POST", {
      assignee_id: raw === "" ? null : raw,
    })
  })
}
