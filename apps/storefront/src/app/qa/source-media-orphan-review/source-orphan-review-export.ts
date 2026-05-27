import type { ExportPayload, ReviewRow } from "./source-orphan-review-types"

export function buildExportPayload(
  items: ReviewRow[],
  auditVariant: string
): ExportPayload {
  const now = new Date().toISOString()
  return {
    generated_at: now,
    review_tool: "source-media-orphan-review-board",
    do_not_auto_apply: true,
    source_orphan_review_only: true,
    not_product_media_assignment: true,
    audit_variant: auditVariant,
    item_count: items.length,
    decisions: items.map((item) => ({
      source_id: item.source_id,
      basename: item.basename,
      source_url: item.source_url,
      operator_decision: item.operator_decision,
      operator_notes: item.operator_notes,
      priority_tier: item.priority_tier,
      classification_status: item.classification_status,
      do_not_auto_apply: true,
      source_orphan_review_only: true,
      not_product_media_assignment: true,
    })),
  }
}

export function exportJsonString(items: ReviewRow[], auditVariant: string): string {
  return JSON.stringify(buildExportPayload(items, auditVariant), null, 2)
}

export async function copyExportToClipboard(
  items: ReviewRow[],
  auditVariant: string
): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(exportJsonString(items, auditVariant))
    return true
  } catch {
    return false
  }
}

export function downloadExportJson(items: ReviewRow[], auditVariant: string): void {
  const blob = new Blob([exportJsonString(items, auditVariant)], {
    type: "application/json",
  })
  const url = URL.createObjectURL(blob)
  const a = document.createElement("a")
  a.href = url
  a.download = `source-media-orphan-review-${new Date().toISOString().slice(0, 10)}.json`
  a.click()
  URL.revokeObjectURL(url)
}
