import { medusaSend } from "@/server/medusa"
import { writeAndReturn } from "@/server/write"

function safeBack(value: string, fallback: string) {
  if (!value.startsWith("/") || value.startsWith("//") || value.includes("://")) return fallback
  return value
}

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params
  const form = await request.formData()
  const back = safeBack(String(form.get("back") ?? ""), "/today")
  return writeAndReturn(request, back, async () => {
    await medusaSend(`/admin/woodright/follow-ups/${id}`, "POST", {
      status: String(form.get("status") ?? "done"),
    })
  })
}
