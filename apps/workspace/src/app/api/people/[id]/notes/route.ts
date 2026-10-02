import { medusaSend } from "@/server/medusa"
import { writeAndReturn } from "@/server/write"

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params
  const form = await request.formData()
  return writeAndReturn(request, `/people/${id}#notes`, async () => {
    await medusaSend(`/admin/woodright/people/${id}/notes`, "POST", {
      text: String(form.get("text") ?? ""),
      kind: String(form.get("kind") ?? "note"),
    })
  })
}
