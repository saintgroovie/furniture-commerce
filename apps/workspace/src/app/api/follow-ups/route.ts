import { medusaSend } from "@/server/medusa"
import { writeAndReturn } from "@/server/write"

function safeBack(value: string, fallback: string) {
  if (!value.startsWith("/") || value.startsWith("//") || value.includes("://")) return fallback
  return value
}

export async function POST(request: Request) {
  const form = await request.formData()
  const back = safeBack(String(form.get("back") ?? ""), "/today")
  const preset = String(form.get("preset") ?? "")
  const dueOn = String(form.get("due_on") ?? "")
  return writeAndReturn(request, back, async () => {
    await medusaSend("/admin/woodright/follow-ups", "POST", {
      entity_type: String(form.get("entity_type") ?? ""),
      entity_id: String(form.get("entity_id") ?? ""),
      preset: preset === "date" ? undefined : preset || undefined,
      due_on: dueOn || undefined,
      text: String(form.get("text") ?? ""),
      assignee_id: form.get("assignee_id") ? String(form.get("assignee_id")) : undefined,
    })
  })
}
