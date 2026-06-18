"use client"

import { useEffect, useRef, useState } from "react"
import type { MediaOpsAssignBridge } from "./media-ops-assign-bridge"

type Mode = "inbox" | "assign" | "launch"

type Props = {
  mode: Mode
  bridge: MediaOpsAssignBridge | null
  onClose: () => void
}

export function MediaOpsExportDrawer({ mode, bridge, onClose }: Props) {
  const [copyStatus, setCopyStatus] = useState<"idle" | "ok" | "err">("idle")
  const [confirmReset, setConfirmReset] = useState(false)
  const [showAdvanced, setShowAdvanced] = useState(false)
  const drawerRef = useRef<HTMLElement>(null)
  const closeBtnRef = useRef<HTMLButtonElement>(null)

  const exportEnabled = mode === "assign" && Boolean(bridge?.exportEnabled)

  useEffect(() => {
    closeBtnRef.current?.focus()
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") onClose()
    }
    document.addEventListener("keydown", onKeyDown)
    return () => document.removeEventListener("keydown", onKeyDown)
  }, [onClose])

  async function handleCopy() {
    if (!bridge || !exportEnabled) return
    const ok = await bridge.onCopy()
    setCopyStatus(ok ? "ok" : "err")
    setTimeout(() => setCopyStatus("idle"), 2200)
  }

  function handleDownload() {
    if (!bridge || !exportEnabled) return
    bridge.onDownload()
  }

  function handleReset() {
    if (!bridge) return
    if (!confirmReset) {
      setConfirmReset(true)
      setTimeout(() => setConfirmReset(false), 4000)
      return
    }
    setConfirmReset(false)
    bridge.onReset()
    onClose()
  }

  return (
    <>
      <div
        className="media-ops-drawer-backdrop"
        role="presentation"
        onClick={onClose}
      />
      <aside
        ref={drawerRef}
        className="media-ops-drawer"
        data-media-ops-export-drawer
        role="dialog"
        aria-modal="true"
        aria-labelledby="media-ops-export-drawer-title"
      >
        <h2 id="media-ops-export-drawer-title">Export</h2>

        {mode === "assign" ? (
          <>
            <p className="media-ops-drawer-lead">
              Assignment handoff JSON · поле <code>do_not_auto_apply: true</code> · вложенный{" "}
              <code>assignment</code> byte-identical v2 export.
            </p>

            {bridge?.exportBlockedReason && !exportEnabled ? (
              <p className="media-ops-drawer-hint" data-v2-export-blocked-reason>
                {bridge.exportBlockedReason}
              </p>
            ) : null}

            {bridge && bridge.assignedCount > 0 ? (
              <p className="media-ops-drawer-meta">
                {bridge.assignedCount} продуктов · {bridge.totalMainCount} главных фото
              </p>
            ) : null}

            <div className="media-ops-drawer-actions">
              <button
                type="button"
                className="media-ops-drawer-btn media-ops-drawer-btn-primary"
                disabled={!exportEnabled}
                onClick={handleCopy}
                data-v2-copy-json-enabled={exportEnabled ? "true" : "false"}
              >
                {copyStatus === "ok"
                  ? "✓ Скопировано"
                  : copyStatus === "err"
                    ? "✗ Ошибка"
                    : "Copy assignment JSON"}
              </button>
              <button
                type="button"
                className="media-ops-drawer-btn"
                disabled={!exportEnabled}
                onClick={handleDownload}
                data-v2-download-json-enabled={exportEnabled ? "true" : "false"}
              >
                ↓ Download assignment JSON
              </button>
            </div>

            <button
              type="button"
              className="media-ops-drawer-advanced-toggle"
              onClick={() => setShowAdvanced((v) => !v)}
              aria-expanded={showAdvanced}
            >
              {showAdvanced ? "▾ Дополнительно" : "▸ Дополнительно"}
            </button>

            {showAdvanced ? (
              <div className="media-ops-drawer-advanced">
                <button
                  type="button"
                  className="media-ops-drawer-btn media-ops-drawer-btn-danger"
                  onClick={handleReset}
                >
                  {confirmReset ? "Подтвердить reset Assign?" : "Reset assign session"}
                </button>
                <p className="media-ops-drawer-hint">
                  Очищает только localStorage v2 board в этом браузере.
                </p>
              </div>
            ) : null}
          </>
        ) : mode === "inbox" ? (
          <p className="media-ops-drawer-lead">
            Inbox triage export — Phase 3. Пока используйте legacy orphan / supplement boards.
          </p>
        ) : (
          <p className="media-ops-drawer-lead">
            Launch matrix export — Phase 5. Пока используйте matrix board Save CSV.
          </p>
        )}

        <button
          ref={closeBtnRef}
          type="button"
          className="media-ops-drawer-close"
          onClick={onClose}
        >
          Закрыть
        </button>
      </aside>
    </>
  )
}
