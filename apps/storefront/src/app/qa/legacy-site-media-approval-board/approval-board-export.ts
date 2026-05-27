import type { ChecklistItem, ChecklistPayload, DesignerDecision } from "./approval-board-types"

export type ExportInput = {
  base: ChecklistPayload
  items: ChecklistItem[]
}

export function buildExportPayload(input: ExportInput): ChecklistPayload {
  const now = new Date().toISOString()
  return {
    generated_at: input.base.generated_at,
    candidate_count: input.items.length,
    default_decision: input.base.default_decision ?? "pending",
    reviewed_at: now,
    review_tool: "legacy-site-media-supplement-triage-board",
    source_pack_path: "tmp/legacy-site-media-approval-pack",
    items: input.items.map((item) => ({
      ...item,
      designer_decision: item.designer_decision as DesignerDecision,
      notes: item.notes ?? "",
      do_not_auto_apply: item.do_not_auto_apply ?? true,
      operator_role: item.operator_role ?? null,
      operator_duplicate_status: item.operator_duplicate_status ?? "unchecked",
      operator_duplicate_note: item.operator_duplicate_note ?? "",
      product_title_source: item.product_title_source ?? null,
    })),
  }
}

export function exportJsonString(input: ExportInput): string {
  return JSON.stringify(buildExportPayload(input), null, 2)
}

export async function copyExportToClipboard(input: ExportInput): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(exportJsonString(input))
    return true
  } catch {
    return false
  }
}

export function downloadExportJson(input: ExportInput): void {
  const blob = new Blob([exportJsonString(input)], { type: "application/json" })
  const url = URL.createObjectURL(blob)
  const a = document.createElement("a")
  a.href = url
  a.download = `legacy-site-media-triage-${new Date().toISOString().slice(0, 10)}.json`
  a.click()
  URL.revokeObjectURL(url)
}
