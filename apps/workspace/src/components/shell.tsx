import type { ReactNode } from "react"
import { DeskNav, MobileNav } from "@/components/desk-nav"
import { CommandPalette } from "@/components/command-palette"
import { UserMenu } from "@/components/user-menu"

function todayLabel(now = new Date()): string {
  return new Intl.DateTimeFormat("ru-RU", {
    timeZone: "Europe/Moscow",
    weekday: "long",
    day: "numeric",
    month: "long",
  }).format(now)
}

export function Shell({
  email,
  preview,
  escapeHref,
  todayCount,
  children,
}: {
  email: string
  preview: boolean
  escapeHref: string | null
  todayCount?: number | null
  children: ReactNode
}) {
  return (
    <div className="shell">
      <aside className="sidebar">
        <div className="brand">
          <span className="brand-mark">Стол</span>
          <span className="brand-sub">WOODRIGHT</span>
        </div>
        <DeskNav todayCount={todayCount} />
        <footer className="sidebar-footer">
          <UserMenu email={email} escapeHref={escapeHref} />
        </footer>
      </aside>
      <div className="main">
        <div className="topbar">
          <span className="mobile-brand">Стол</span>
          <CommandPalette />
          <span className="topbar-date">{todayLabel()} · MSK</span>
        </div>
        {preview ? <div className="preview-banner">Пример данных. Medusa к этому экрану не подключена</div> : null}
        <div className="content">{children}</div>
        <MobileNav />
      </div>
    </div>
  )
}
