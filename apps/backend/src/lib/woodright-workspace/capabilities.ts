import { resolveStaffAccess, type StaffAccess, type StaffCapability } from "./permissions"

/** Server actions. Existing admins keep operational ones. Escape stays separate. */
export const DESK_ACTIONS = [
  "orders.view",
  "orders.process.write",
  "orders.note.write",
  "people.view",
  "people.link",
  "people.assign",
  "catalog.view",
  "catalog.edit",
  "catalog.media",
  "catalog.publish",
  "catalog.price",
  "promotions.manage",
  "site.manage",
  "admin.escape",
] as const

export type DeskAction = (typeof DESK_ACTIONS)[number]

const ACTION_CAPABILITY: Record<DeskAction, StaffCapability> = {
  "orders.view": "view_orders",
  "orders.process.write": "edit_order_process",
  "orders.note.write": "edit_order_process",
  "people.view": "view_contacts",
  "people.link": "edit_contacts",
  "people.assign": "edit_contacts",
  "catalog.view": "view_catalog",
  "catalog.edit": "edit_catalog",
  "catalog.media": "edit_catalog",
  "catalog.publish": "publish_catalog",
  "catalog.price": "edit_catalog",
  "promotions.manage": "manage_promotions",
  "site.manage": "manage_site",
  "admin.escape": "developer_escape_hatch",
}

export function accessAllows(access: StaffAccess, action: DeskAction): boolean {
  return access.capabilities[ACTION_CAPABILITY[action]] === true
}

export type DeskWriteDecision =
  | { ok: true; email: string | null }
  | { ok: false; status: 401 | 403; message: string }

/**
 * Authenticated Medusa admins keep daily writes. A missing actor is denied.
 * Turning a capability off later denies that action without a UI-only hide.
 */
export function decideDeskWrite(input: {
  actorId?: string | null
  email?: string | null
  action: DeskAction
  ownerEmailsRaw?: string | null
}): DeskWriteDecision {
  if (!input.actorId) {
    return { ok: false, status: 401, message: "Нужен вход" }
  }
  const access = resolveStaffAccess({
    email: input.email,
    ownerEmailsRaw: input.ownerEmailsRaw,
  })
  if (!accessAllows(access, input.action)) {
    return { ok: false, status: 403, message: "Недостаточно прав" }
  }
  return { ok: true, email: access.email }
}
