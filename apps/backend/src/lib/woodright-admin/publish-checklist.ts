import type { WorkspacePublishReadiness } from "./publish-readiness"

export type ChecklistAction = "focus_price" | "focus_media" | "focus_title"

export type ChecklistKind = "done" | "blocker" | "warning"

export type PublishChecklistItem = {
  id: string
  kind: ChecklistKind
  label: string
  action?: ChecklistAction
  adminOnly?: boolean
}

const CORE_ROWS: Array<{
  id: "title" | "sku" | "collection" | "price" | "media"
  doneLabel: string
  blockerCodes: string[]
}> = [
  { id: "title", doneLabel: "Название", blockerCodes: ["missing_title"] },
  { id: "sku", doneLabel: "Артикул", blockerCodes: ["missing_sku"] },
  { id: "collection", doneLabel: "Коллекция", blockerCodes: ["missing_collection", "invalid_collection"] },
  { id: "price", doneLabel: "Цена", blockerCodes: ["missing_price"] },
  { id: "media", doneLabel: "Фото", blockerCodes: ["missing_media"] },
]

const BLOCKER_ACTION: Record<string, ChecklistAction> = {
  missing_price: "focus_price",
  missing_media: "focus_media",
  missing_title: "focus_title",
}

const ADMIN_BLOCKER_CODES = new Set(["missing_collection", "invalid_collection"])

export function checklistActionForCode(code: string): ChecklistAction | undefined {
  return BLOCKER_ACTION[code]
}

export function isAdminOnlyBlocker(code: string): boolean {
  return ADMIN_BLOCKER_CODES.has(code) || code === "missing_execution_setup"
}

function blockerMessage(
  readiness: WorkspacePublishReadiness,
  codes: string[],
  fallback: string
): string {
  const found = readiness.blockers.find((item) => codes.includes(item.code))
  return found?.message ?? fallback
}

/**
 * Seller-facing publish checklist. Does not change readiness semantics.
 * missing_execution_setup stays a warning (OWNER DECISION OPEN).
 */
export function buildPublishChecklist(readiness: WorkspacePublishReadiness): PublishChecklistItem[] {
  const items: PublishChecklistItem[] = []
  const blockerCodes = new Set(readiness.blockers.map((item) => item.code))

  for (const row of CORE_ROWS) {
    const hit = row.blockerCodes.find((code) => blockerCodes.has(code))
    if (!hit) {
      items.push({ id: row.id, kind: "done", label: row.doneLabel })
      continue
    }
    const adminOnly = isAdminOnlyBlocker(hit)
    items.push({
      id: hit,
      kind: "blocker",
      label: blockerMessage(readiness, row.blockerCodes, row.doneLabel),
      action: adminOnly ? undefined : checklistActionForCode(hit),
      adminOnly,
    })
  }

  for (const blocker of readiness.blockers) {
    if (CORE_ROWS.some((row) => row.blockerCodes.includes(blocker.code))) continue
    items.push({
      id: blocker.code,
      kind: "blocker",
      label: blocker.message,
      action: checklistActionForCode(blocker.code),
      adminOnly: isAdminOnlyBlocker(blocker.code),
    })
  }

  for (const warning of readiness.warnings) {
    const adminOnly = isAdminOnlyBlocker(warning.code)
    items.push({
      id: warning.code,
      kind: "warning",
      label: warning.message,
      adminOnly,
    })
  }

  return items
}
