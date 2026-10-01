import { medusaSend } from "@/server/medusa"
import { writeAndReturn } from "@/server/write"

/**
 * Person assignee through the existing person-link write path
 * (`assignee_id` only; customer link is untouched because `customer_id` is omitted).
 */
export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params
  const form = await request.formData()
  const raw = String(form.get("assignee_id") ?? "")
  return writeAndReturn(request, `/people/${id}`, async () => {
    await medusaSend(`/admin/woodright/people/${id}/link`, "POST", {
      assignee_id: raw === "" ? null : raw,
    })
  })
}
