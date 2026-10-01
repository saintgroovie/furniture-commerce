import { medusaSend } from "@/server/medusa"
import { writeAndReturn } from "@/server/write"

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params
  const form = await request.formData()
  return writeAndReturn(request, `/people/${id}`, async () => {
    await medusaSend(`/admin/woodright/people/${id}/roles`, "POST", {
      role: String(form.get("role") ?? ""),
      remove: form.get("remove") === "1",
    })
  })
}
