"use client"

import { useMemo, useState } from "react"
import type { V2ProductState, InvItem, ProductRow } from "./legacy-board-v2-types"
import {
  copyV2ExportToClipboard,
  downloadV2ExportJSON,
  getV2ExportDisabledReason,
  hasAnyV2Assignments,
} from "./legacy-board-v2-export"
import { clearV2PersistedState, formatSavedAt } from "./legacy-board-v2-persistence"

type Props = {
  productStates: Record<string, V2ProductState>
  invById: Map<string, InvItem>
  products: ProductRow[]
  savedAt: string | null
  selectedHandle: string | null
  onReset: () => void
  /** Media Ops shell owns Copy/Download/Reset in export drawer. */
  embeddedInShell?: boolean
}

export function ExportToolbar({
  productStates,
  invById,
  products,
  savedAt,
  selectedHandle,
  onReset,
  embeddedInShell = false,
}: Props) {
  const [copyStatus, setCopyStatus] = useState<"idle" | "ok" | "err">("idle")
  const [confirmReset, setConfirmReset] = useState(false)

  const exportEnabled = useMemo(() => hasAnyV2Assignments(productStates), [productStates])
  const exportBlockedReason = useMemo(
    () => getV2ExportDisabledReason(productStates, selectedHandle),
    [productStates, selectedHandle]
  )

  const assignedCount = Object.values(productStates).filter((s) =>
    Object.values(s.rolesByVariant).some((r) => Object.values(r).some((v) => !!v)) ||
    Object.values(s.galleriesByVariant).some((g) => g.length > 0)
  ).length

  const totalMainCount = Object.values(productStates).reduce((acc, s) => {
    return acc + Object.values(s.rolesByVariant).filter((r) => !!r.main).length
  }, 0)

  async function handleCopy() {
    if (!exportEnabled) return
    const ok = await copyV2ExportToClipboard(productStates, invById, products)
    setCopyStatus(ok ? "ok" : "err")
    setTimeout(() => setCopyStatus("idle"), 2200)
  }

  function handleDownload() {
    if (!exportEnabled) return
    downloadV2ExportJSON(productStates, invById, products)
  }

  function handleResetClick() {
    if (!confirmReset) {
      setConfirmReset(true)
      setTimeout(() => setConfirmReset(false), 4000)
      return
    }
    setConfirmReset(false)
    clearV2PersistedState()
    onReset()
  }

  const saveLabel = savedAt
    ? `Сохранено ${formatSavedAt(savedAt)}`
    : "Не сохранено"

  const saveLabelColor = savedAt ? "#1a6a1a" : "#888"

  if (embeddedInShell) {
    return null
  }

  return (
    <div style={styles.toolbar}>
      <span style={{ ...styles.saveStatus, color: saveLabelColor }}>
        {savedAt ? "💾" : "○"} {saveLabel}
        {assignedCount > 0 && (
          <span style={styles.countChip}>{assignedCount} прод. · {totalMainCount} главных</span>
        )}
      </span>

      {exportBlockedReason && (
        <span style={styles.exportHint} data-v2-export-blocked-reason>
          {exportBlockedReason}
        </span>
      )}

      <div style={styles.actions}>
        <button
          style={{
            ...styles.btn,
            ...(copyStatus === "ok" ? styles.btnOk : copyStatus === "err" ? styles.btnErr : {}),
            ...(!exportEnabled ? styles.btnDisabled : {}),
          }}
          disabled={!exportEnabled}
          onClick={handleCopy}
          title={
            exportEnabled
              ? "Скопировать JSON в буфер обмена"
              : exportBlockedReason ?? "Нет назначений"
          }
          data-v2-copy-json-enabled={exportEnabled ? "true" : "false"}
        >
          {copyStatus === "ok" ? "✓ Скопировано" : copyStatus === "err" ? "✗ Ошибка" : "Copy JSON"}
        </button>

        <button
          style={{
            ...styles.btn,
            ...styles.btnDownload,
            ...(!exportEnabled ? styles.btnDisabled : {}),
          }}
          disabled={!exportEnabled}
          onClick={handleDownload}
          title={exportEnabled ? "Скачать JSON файл" : exportBlockedReason ?? "Нет назначений"}
          data-v2-download-json-enabled={exportEnabled ? "true" : "false"}
        >
          ↓ Download
        </button>

        <button
          style={{
            ...styles.btn,
            ...styles.btnReset,
            ...(confirmReset ? styles.btnResetConfirm : {}),
          }}
          onClick={handleResetClick}
          title="Очистить только v2board localStorage"
        >
          {confirmReset ? "Подтвердить?" : "Reset v2"}
        </button>
      </div>
    </div>
  )
}

const styles = {
  toolbarEmbedded: {
    display: "flex",
    alignItems: "center",
    padding: "4px 14px",
    background: "#fffbf0",
    borderBottom: "1px solid #f0e6c8",
    flexShrink: 0,
    minHeight: "28px",
  },
  toolbar: {
    display: "flex",
    alignItems: "center",
    gap: "10px",
    padding: "5px 14px",
    background: "#f5f5f5",
    borderBottom: "1px solid #e8e8e8",
    flexShrink: 0,
    flexWrap: "wrap" as const,
    minHeight: "32px",
  },
  saveStatus: {
    fontSize: "11px",
    color: "#555",
    display: "flex",
    alignItems: "center",
    gap: "6px",
    flexShrink: 0,
  },
  exportHint: {
    fontSize: "10px",
    color: "#8a5a00",
    background: "#fff8e8",
    border: "1px solid #f0d8a0",
    borderRadius: "4px",
    padding: "2px 8px",
    flex: "1 1 200px",
    minWidth: 0,
    lineHeight: 1.35,
  },
  countChip: {
    fontSize: "10px",
    background: "#e0eecc",
    color: "#335500",
    borderRadius: "8px",
    padding: "1px 7px",
    fontWeight: 600,
    flexShrink: 0,
  },
  actions: {
    display: "flex",
    gap: "5px",
    flexShrink: 0,
    marginLeft: "auto",
  },
  btn: {
    padding: "3px 10px",
    fontSize: "11px",
    border: "1px solid #ddd",
    borderRadius: "4px",
    background: "#fff",
    color: "#333",
    cursor: "pointer",
    fontWeight: 500,
    transition: "background 0.15s",
    whiteSpace: "nowrap" as const,
  },
  btnOk: {
    background: "#e8f8e8",
    borderColor: "#8bcc8b",
    color: "#1a6a1a",
  },
  btnErr: {
    background: "#ffe8e8",
    borderColor: "#ee9999",
    color: "#a00",
  },
  btnDownload: {
    borderColor: "#aacaff",
    color: "#1a3a6e",
    background: "#e8f0ff",
  },
  btnReset: {
    borderColor: "#ffccaa",
    color: "#994400",
    background: "#fff8f0",
  },
  btnResetConfirm: {
    borderColor: "#ee8844",
    color: "#fff",
    background: "#cc5500",
    fontWeight: 700,
  },
  btnDisabled: {
    opacity: 0.45,
    cursor: "not-allowed",
  },
} as const
