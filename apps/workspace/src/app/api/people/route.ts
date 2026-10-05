import { DeskHttpError, medusaSend } from "@/server/medusa"
import { redirectTo } from "@/server/redirect"
import { requireDeskSession } from "@/server/write"

export async function POST(request: Request) {
  const gate = await requireDeskSession(request)
  if (!gate.ok) return gate.response
  const form = await request.formData()
  try {
    const created = await medusaSend<{ id: string | null }>("/admin/woodright/people", "POST", {
      name: String(form.get("name") ?? ""),
      email: String(form.get("email") ?? ""),
      phone: String(form.get("phone") ?? ""),
      confirm: form.get("confirm") === "1",
    })
    if (!created.id) return redirectTo(request, "/clients?mode=people&error=Человек%20не%20сохранился#new")
    return redirectTo(request, `/people/${created.id}?saved=1`)
  } catch (error) {
    const message = error instanceof DeskHttpError ? error.message : "Не удалось сохранить"
    const params = new URLSearchParams({
      mode: "people",
      create: "1",
      error: message.slice(0, 180),
      name: String(form.get("name") ?? "").slice(0, 160),
      email: String(form.get("email") ?? "").slice(0, 160),
      phone: String(form.get("phone") ?? "").slice(0, 40),
    })
    const ids = error instanceof DeskHttpError && Array.isArray(error.payload?.ids) ? error.payload.ids : []
    const matches = ids.filter((id): id is string => typeof id === "string" && /^[A-Za-z0-9]+$/.test(id)).slice(0, 5)
    if (matches.length > 0) params.set("matches", matches.join(","))
    return redirectTo(request, `/clients?${params.toString()}#new`)
  }
}
