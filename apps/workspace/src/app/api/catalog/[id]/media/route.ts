import { medusaSend } from "@/server/medusa"
import { writeAndReturn } from "@/server/write"

const MAX_BYTES = 8 * 1024 * 1024

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params
  const form = await request.formData()
  const file = form.get("file")
  const json = request.headers.get("x-desk-upload") === "1"
  if (!(file instanceof File)) {
    return fail(request, id, json, "Выберите файл")
  }
  if (file.size > MAX_BYTES) {
    return fail(request, id, json, "Файл больше 8 МБ")
  }
  const bytes = Buffer.from(await file.arrayBuffer())
  try {
    await medusaSend(`/admin/woodright/products/${id}/media/upload`, "POST", {
      content_base64: bytes.toString("base64"),
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : "Не удалось загрузить кадр"
    return fail(request, id, json, message)
  }
  if (json) {
    return Response.json({ ok: true })
  }
  return writeAndReturn(request, `/catalog/${id}`, async () => undefined)
}

function fail(request: Request, id: string, json: boolean, message: string) {
  if (json) return Response.json({ message }, { status: 400 })
  const params = new URLSearchParams({ error: message.slice(0, 180) })
  return Response.redirect(new URL(`/catalog/${id}?${params.toString()}`, request.url), 303)
}
