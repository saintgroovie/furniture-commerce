import type { ReactNode } from "react"
import { DeskNav } from "@/components/desk-nav"
import { CommandPalette } from "@/components/command-palette"

export function Shell({
  email,
  preview,
  escapeHref,
  children,
}: {
  email: string
  preview: boolean
  escapeHref: string | null
  children: ReactNode
}) {
  return (
    <div className="shell">
      <aside className="sidebar">
        <div className="brand">
          <strong>Стол</strong>
          <span>Woodright</span>
        </div>
        <DeskNav />
        <footer>
          <div>{email}</div>
          <form action="/api/session" method="post">
            <input type="hidden" name="intent" value="logout" />
            <button className="text-button" type="submit" style={{ color: "inherit", marginTop: 8 }}>
              Выйти
            </button>
          </form>
          {escapeHref ? (
            <a href={escapeHref} style={{ display: "inline-block", marginTop: 10 }}>
              Открыть в Medusa
            </a>
          ) : null}
        </footer>
      </aside>
      <div className="main">
        <div className="topbar">
          <CommandPalette />
        </div>
        {preview ? <div className="banner">Пример данных. Medusa к этому экрану не подключена</div> : null}
        {children}
      </div>
    </div>
  )
}
