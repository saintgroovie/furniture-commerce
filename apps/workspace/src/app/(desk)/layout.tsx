import type { ReactNode } from "react"
import { Shell } from "@/components/shell"
import { visibleNav } from "@/lib/nav"
import { loadAccess, loadMailStatus } from "@/server/loaders"
import { requireSession } from "@/server/session"

export default async function DeskLayout({ children }: { children: ReactNode }) {
  const session = await requireSession()
  const access = await loadAccess()
  const mail = await loadMailStatus()
  const escapeHref = access.ok ? access.data.medusa_admin_url : null
  return (
    <Shell email={session.email} preview={session.kind === "preview"} escapeHref={escapeHref} navItems={visibleNav(mail.ok && mail.data.visible)}>
      {children}
    </Shell>
  )
}
