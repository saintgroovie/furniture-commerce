import type { ReactNode } from "react"
import { Shell } from "@/components/shell"
import { loadAccess } from "@/server/loaders"
import { requireSession } from "@/server/session"

export default async function DeskLayout({ children }: { children: ReactNode }) {
  const session = await requireSession()
  const access = await loadAccess()
  const escapeHref = access.ok ? access.data.medusa_admin_url : null
  return (
    <Shell email={session.email} preview={session.kind === "preview"} escapeHref={escapeHref}>
      {children}
    </Shell>
  )
}
