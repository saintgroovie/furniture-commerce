import { medusaSend } from "@/server/medusa"
import { writeAndReturn } from "@/server/write"

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params
  const form = await request.formData()
  return writeAndReturn(request, `/requests/${id}`, async () => {
    const companyId = form.get("company_id")
    const counterpartyId = form.get("counterparty_lead_id")
    const orderId = form.get("order_id")
    await medusaSend(`/admin/woodright/requests/${id}/relations`, "POST", {
      ...(companyId == null ? {} : { company_id: String(companyId) || null }),
      ...(counterpartyId == null ? {} : { counterparty_lead_id: String(counterpartyId) || null }),
      ...(orderId == null ? {} : { order_id: String(orderId) || null }),
    })
  })
}
