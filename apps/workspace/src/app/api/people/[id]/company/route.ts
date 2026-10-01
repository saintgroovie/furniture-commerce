import { medusaSend } from "@/server/medusa"
import { writeAndReturn } from "@/server/write"

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params
  const form = await request.formData()
  const companyId = String(form.get("company_id") ?? "")
  return writeAndReturn(request, `/people/${id}`, async () => {
    await medusaSend(`/admin/woodright/people/${id}/companies`, "POST", {
      company_id: companyId || undefined,
      name: String(form.get("name") ?? ""),
      type: String(form.get("type") ?? "") || null,
      unlink: form.get("unlink") === "1",
    })
  })
}
