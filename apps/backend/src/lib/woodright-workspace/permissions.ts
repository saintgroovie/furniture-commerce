export const STAFF_CAPABILITIES = [
  "view_orders",
  "edit_order_process",
  "view_contacts",
  "edit_contacts",
  "view_catalog",
  "edit_catalog",
  "publish_catalog",
  "manage_promotions",
  "manage_site",
  "view_crm",
  "edit_crm",
  "link_customer",
  "assign_crm",
  "follow_up",
  "view_sensitive_settings",
  "developer_escape_hatch",
] as const

export type StaffCapability = (typeof STAFF_CAPABILITIES)[number]

export type StaffAccess = {
  role: "owner" | "staff"
  email: string | null
  capabilities: Record<StaffCapability, boolean>
  escape_hatch: boolean
}

const OPERATIONAL: StaffCapability[] = [
  "view_orders",
  "edit_order_process",
  "view_contacts",
  "edit_contacts",
  "view_catalog",
  "edit_catalog",
  "publish_catalog",
  "manage_promotions",
  "manage_site",
  "view_crm",
  "edit_crm",
  "link_customer",
  "assign_crm",
  "follow_up",
]

function blank(value: boolean): Record<StaffCapability, boolean> {
  return Object.fromEntries(STAFF_CAPABILITIES.map((key) => [key, value])) as Record<
    StaffCapability,
    boolean
  >
}

export function parseOwnerEmails(raw: string | null | undefined): string[] {
  if (!raw) return []
  return raw
    .split(",")
    .map((part) => part.trim().toLowerCase())
    .filter(Boolean)
}

/**
 * Existing admins keep daily work. The Medusa escape hatch stays closed
 * unless the signed-in email is on the server allowlist.
 * An empty allowlist does not grant owner to everyone.
 */
export function resolveStaffAccess(input: {
  email?: string | null
  ownerEmailsRaw?: string | null
}): StaffAccess {
  const email = input.email?.trim().toLowerCase() || null
  const owners = parseOwnerEmails(input.ownerEmailsRaw)
  const isOwner = Boolean(email && owners.includes(email))
  const capabilities = blank(false)
  for (const key of OPERATIONAL) capabilities[key] = true
  capabilities.view_sensitive_settings = isOwner
  capabilities.developer_escape_hatch = isOwner
  return {
    role: isOwner ? "owner" : "staff",
    email,
    capabilities,
    escape_hatch: isOwner,
  }
}

export function safeAdminFallbackUrl(raw: string | null | undefined): string | null {
  const value = raw?.trim() || "http://127.0.0.1:9000/app"
  let url: URL
  try {
    url = new URL(value)
  } catch {
    return null
  }
  const hostname = url.hostname.replace(/\.+$/g, "").toLowerCase()
  if (hostname === "admin.woodright.ru") return null
  if (url.protocol !== "http:" && url.protocol !== "https:") return null
  return url.toString()
}
