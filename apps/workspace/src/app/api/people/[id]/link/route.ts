import { NextResponse } from "next/server"
import { medusaSend } from "@/server/medusa"
import { redirectTo } from "@/server/redirect"
import { readSession } from "@/server/session"

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const session = await readSession()
  if (!session || session.kind !== "medusa") {
    return NextResponse.json({ message: "Нужен вход" }, { status: 401 })
  }
  const { id } = await context.params
  const form = await request.formData()
  const customerId = String(form.get("customer_id") ?? "")
  if (!customerId || customerId.includes(",")) {
    return NextResponse.json({ message: "Нужен один покупатель" }, { status: 400 })
  }
  try {
    await medusaSend(`/admin/woodright/people/${id}/link`, "POST", { customer_id: customerId })
  } catch {
    return redirectTo(request, `/people/${id}?saved=0`)
  }
  return redirectTo(request, `/people/${id}?saved=1`)
}
