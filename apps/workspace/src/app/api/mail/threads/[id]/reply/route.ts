import { NextResponse } from "next/server"
import { DeskHttpError, medusaSend } from "@/server/medusa"
import { requireDeskSession } from "@/server/write"

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const gate = await requireDeskSession(request)
  if (!gate.ok) return gate.response
  const { id } = await context.params
  const body = (await request.json().catch(() => null)) as { text?: string } | null
  try {
    await medusaSend(`/admin/woodright/mail/threads/${encodeURIComponent(id)}/reply`, "POST", {
      text: body?.text ?? "",
    })
    return NextResponse.json({ ok: true })
  } catch (error) {
    const status = error instanceof DeskHttpError ? error.status : 502
    return NextResponse.json({ ok: false, message: "Письмо не отправлено." }, { status })
  }
}
