"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { useCallback, useEffect, useMemo, useState } from "react"
import { formatSavedAt } from "../legacy-media-assignment-board-v2/legacy-board-v2-persistence"
import { useMediaOpsAssignBridge } from "./media-ops-assign-bridge"
import { MediaOpsExportDrawer } from "./MediaOpsExportDrawer"
import { detectLegacyBoardStorage } from "./media-ops-migration"

const MODES = [
  { id: "inbox", label: "Inbox", href: "/qa/media-ops/inbox" },
  { id: "assign", label: "Assign", href: "/qa/media-ops/assign" },
  { id: "launch", label: "Launch", href: "/qa/media-ops/launch" },
] as const

type ModeId = (typeof MODES)[number]["id"]

const MIGRATION_DISMISS_KEY = "woodright:media-ops:migration-banner-dismissed:v1"

function activeModeId(pathname: string): ModeId {
  if (pathname.startsWith("/qa/media-ops/inbox")) return "inbox"
  if (pathname.startsWith("/qa/media-ops/launch")) return "launch"
  return "assign"
}

export function MediaOpsShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname() ?? ""
  const active = activeModeId(pathname)
  const bridgeCtx = useMediaOpsAssignBridge()
  const bridge = active === "assign" ? bridgeCtx?.bridge ?? null : null
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [migrationDismissed, setMigrationDismissed] = useState(true)
  const [legacyDetect, setLegacyDetect] = useState<ReturnType<typeof detectLegacyBoardStorage> | null>(
    null
  )

  useEffect(() => {
    setMigrationDismissed(sessionStorage.getItem(MIGRATION_DISMISS_KEY) === "1")
    setLegacyDetect(detectLegacyBoardStorage())
  }, [])

  const closeDrawer = useCallback(() => setDrawerOpen(false), [])

  const saveLabel = useMemo(() => {
    if (active !== "assign") return null
    if (!bridge) return "⏳ Загрузка Assign…"
    if (bridge.boardStatus === "loading" || bridge.boardStatus === "idle") {
      return "⏳ Загрузка данных…"
    }
    if (!bridge.savedAt) return "○ Не сохранено"
    return `💾 Сохранено ${formatSavedAt(bridge.savedAt)}`
  }, [active, bridge])

  const saveSaved = active === "assign" && Boolean(bridge?.savedAt)

  const showMigrationBanner =
    legacyDetect?.hasAny && !migrationDismissed && active === "assign"

  function dismissMigration() {
    sessionStorage.setItem(MIGRATION_DISMISS_KEY, "1")
    setMigrationDismissed(true)
  }

  return (
    <div className="media-ops-root" data-media-ops-shell>
      <header className="media-ops-header">
        <span className="media-ops-brand">Woodright Media Ops</span>
        <span className="media-ops-badge">dev · no catalog writes</span>

        <nav className="media-ops-tabs" aria-label="Media Ops modes">
          {MODES.map((mode) => (
            <Link
              key={mode.id}
              href={mode.href}
              className="media-ops-tab"
              data-active={active === mode.id ? "true" : "false"}
              data-media-ops-tab={mode.id}
            >
              {mode.label}
            </Link>
          ))}
        </nav>

        <div className="media-ops-header-right">
          {saveLabel ? (
            <span
              className="media-ops-save-status"
              data-saved={saveSaved ? "true" : "false"}
              data-media-ops-save-status
            >
              {saveLabel}
              {bridge && bridge.assignedCount > 0 ? (
                <span className="media-ops-save-chip">{bridge.assignedCount} прод.</span>
              ) : null}
            </span>
          ) : null}
          <button
            type="button"
            className="media-ops-btn-export"
            data-media-ops-export-btn
            onClick={() => setDrawerOpen(true)}
          >
            Export
          </button>
        </div>
      </header>

      {showMigrationBanner ? (
        <div className="media-ops-migration-banner" data-media-ops-migration-banner>
          <span>
            Найдены решения в старых бордах (
            {legacyDetect!.found.map((f) => f.label).join(", ")}). Полный import — Phase 6; v2
            localStorage пока работает параллельно.
          </span>
          <button type="button" className="media-ops-migration-dismiss" onClick={dismissMigration}>
            Позже
          </button>
        </div>
      ) : null}

      <main className="media-ops-content">{children}</main>

      {drawerOpen ? (
        <MediaOpsExportDrawer mode={active} bridge={bridge} onClose={closeDrawer} />
      ) : null}
    </div>
  )
}
