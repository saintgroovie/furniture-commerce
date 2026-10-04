import { DeskHttpError, medusaSend } from "@/server/medusa"
import { redirectTo } from "@/server/redirect"
import { requireDeskSession } from "@/server/write"

export async function POST(request: Request) {
  const gate = await requireDeskSession(request)
  if (!gate.ok) return gate.response
  const form = await request.formData()
  const back = String(form.get("back") ?? "")
  const personBack = back.startsWith("/people/") && !back.includes("://") ? back : null
  try {
    const created = await medusaSend<{ id: string | null }>("/admin/woodright/requests", "POST", {
      lead_id: String(form.get("lead_id") ?? ""),
      comment: String(form.get("comment") ?? ""),
    })
    if (!created.id) {
      return redirectTo(request, `${personBack ?? "/clients?mode=requests"}?error=${encodeURIComponent("Обращение не сохранилось")}`)
    }
    return redirectTo(request, `/requests/${created.id}?saved=1`)
  } catch (error) {
    const message = error instanceof DeskHttpError ? error.message : "Не удалось сохранить"
    const target = personBack ?? "/clients?mode=requests"
    const joiner = target.includes("?") ? "&" : "?"
    return redirectTo(request, `${target}${joiner}error=${encodeURIComponent(message.slice(0, 180))}#new`)
  }
}
