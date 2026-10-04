import { DeskHttpError, medusaSend } from "@/server/medusa"
import { redirectTo } from "@/server/redirect"
import { requireDeskSession } from "@/server/write"

export async function POST(request: Request) {
  const gate = await requireDeskSession(request)
  if (!gate.ok) return gate.response
  const form = await request.formData()
  try {
    const created = await medusaSend<{ id: string | null }>("/admin/woodright/companies", "POST", {
      name: String(form.get("name") ?? ""),
      type: String(form.get("type") ?? "") || null,
    })
    if (!created.id) return redirectTo(request, "/clients?mode=companies&error=Компания%20не%20сохранилась#new")
    return redirectTo(request, `/companies/${created.id}?saved=1`)
  } catch (error) {
    const message = error instanceof DeskHttpError ? error.message : "Не удалось сохранить"
    return redirectTo(request, `/clients?mode=companies&error=${encodeURIComponent(message.slice(0, 180))}#new`)
  }
}
