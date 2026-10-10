import { medusaSend } from "@/server/medusa"
import { writeAndReturn } from "@/server/write"

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params
  const form = await request.formData()
  const requested = String(form.get("back") ?? "")
  const internal = (requested.startsWith("/requests/") || requested.startsWith("/inbox/")) && !requested.includes("://") && !requested.includes("//")
  const back = internal ? requested : `/people/${id}#notes`
  return writeAndReturn(request, back, async () => {
    await medusaSend(`/admin/woodright/people/${id}/notes`, "POST", {
      text: String(form.get("text") ?? ""),
      kind: String(form.get("kind") ?? "note"),
    })
  })
}
