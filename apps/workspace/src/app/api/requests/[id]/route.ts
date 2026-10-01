import { medusaSend } from "@/server/medusa"
import { writeAndReturn } from "@/server/write"

const STATUSES = new Set(["new", "contacted", "quote_sent", "paid", "in_production", "completed"])

/**
 * Request stage and internal note through the existing admin bespoke-request PATCH.
 * Status values are the backend's own; nothing new is invented here.
 */
export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params
  const form = await request.formData()
  const status = String(form.get("status") ?? "")
  const hasNote = form.has("internal_notes")
  const note = String(form.get("internal_notes") ?? "")
  return writeAndReturn(
    request,
    `/requests/${id}`,
    async () => {
      const body: { status?: string; internal_notes?: string } = {}
      if (status) {
        if (!STATUSES.has(status)) throw new Error("bad status")
        body.status = status
      }
      if (hasNote) body.internal_notes = note
      if (!body.status && !hasNote) return
      await medusaSend(`/admin/bespoke-requests/${id}`, "PATCH", body)
    },
    hasNote ? { note } : undefined
  )
}
