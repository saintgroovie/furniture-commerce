"use client"

import { useState } from "react"
import type { InvItem } from "./legacy-media-board-types"

type CardSize = "compact" | "normal" | "large" | "xlarge"
/** full = default QA card; pool = media drawer (image-first, minimal metadata). */
type CardDisplayMode = "full" | "pool"

type Props = {
  inventoryId: string
  inv: InvItem
  productHandle?: string | null
  previewUrl: string | null
  useImg: boolean
  caption: string
  badges?: string[]
  size?: CardSize
  displayMode?: CardDisplayMode
  draggable?: boolean
  isDragging?: boolean
  onDragStart?: (e: React.DragEvent) => void
  onDragEnd?: (e: React.DragEvent) => void
  detailTitle?: string
  sourcePath?: string | null
  sourceType?: string | null
  confidenceLabel?: string | null
  previewable?: boolean
  filenameMaxLen?: number
  dataZone?: string | null
  onOpenDetail?: () => void
  onCardPointerDownCapture?: (e: React.PointerEvent) => void
  onCardClickCapture?: (e: React.MouseEvent) => void
  assignedControlsAboveDrag?: boolean
  children?: React.ReactNode
}

const cardPx: Record<CardSize, number> = { compact: 88, normal: 120, large: 160, xlarge: 196 }

function truncateMiddle(s: string, max: number) {
  if (s.length <= max) return s
  const half = Math.floor((max - 1) / 2)
  return `${s.slice(0, half)}…${s.slice(s.length - half)}`
}

export function MediaImageCard({
  inventoryId,
  inv,
  productHandle = null,
  previewUrl,
  useImg,
  caption,
  badges = [],
  size = "normal",
  displayMode = "full",
  draggable = true,
  isDragging = false,
  onDragStart,
  onDragEnd,
  detailTitle,
  sourcePath,
  sourceType,
  confidenceLabel,
  previewable = true,
  filenameMaxLen = 32,
  dataZone = null,
  onOpenDetail,
  onCardPointerDownCapture,
  onCardClickCapture,
  assignedControlsAboveDrag = false,
  children,
}: Props) {
  const w = cardPx[size]
  const poolMode = displayMode === "pool"
  const [imgBroken, setImgBroken] = useState(false)
  const showImg = useImg && previewUrl && !imgBroken
  const fullPathTitle = detailTitle ?? inv.source_path ?? inv.repo_relative_path ?? inv.filename
  const nameShown = truncateMiddle(inv.filename, poolMode ? Math.min(filenameMaxLen, 22) : filenameMaxLen)
  const canDrag = Boolean(draggable && onDragStart)

  return (
    <div
      data-inventory-id={inventoryId}
      data-media-card="true"
      data-media-id={inventoryId}
      data-product-handle={productHandle || ""}
      data-zone={dataZone || ""}
      draggable={canDrag}
      onDragStart={canDrag ? onDragStart : undefined}
      onDragEnd={canDrag ? onDragEnd : undefined}
      onPointerDownCapture={onCardPointerDownCapture}
      onClickCapture={onCardClickCapture}
      style={{
        width: "100%",
        maxWidth: w + 16,
        boxSizing: "border-box",
        borderRadius: 12,
        border: isDragging ? "2px solid #2563eb" : "1px solid #e2e8f0",
        background: isDragging ? "#eff6ff" : "#fff",
        boxShadow: isDragging ? "0 4px 14px rgba(37,99,235,0.2)" : "0 1px 2px rgba(15,23,42,0.06)",
        padding: poolMode ? 6 : size === "xlarge" || size === "large" ? 10 : 8,
        cursor: canDrag ? "grab" : "default",
        userSelect: "none",
        opacity: isDragging ? 0.9 : 1,
      }}
    >
      <div
        role={onOpenDetail ? "button" : undefined}
        tabIndex={onOpenDetail ? 0 : undefined}
        onClick={(e) => {
          if (!onOpenDetail) return
          e.stopPropagation()
          onOpenDetail()
        }}
        onKeyDown={(e) => {
          if (!onOpenDetail) return
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault()
            onOpenDetail()
          }
        }}
        title={fullPathTitle}
        style={{
          position: "relative",
          width: "100%",
          maxWidth: w,
          margin: "0 auto",
          aspectRatio: "1",
          borderRadius: 10,
          overflow: "hidden",
          background: "#f1f5f9",
        }}
      >
        {showImg ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={previewUrl}
            alt=""
            width={w}
            height={w}
            draggable={false}
            style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }}
            onError={() => setImgBroken(true)}
          />
        ) : (
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              height: "100%",
              padding: 8,
              fontSize: 10,
              color: "#475569",
              textAlign: "center",
            }}
          >
            {imgBroken ? "Preview failed" : caption || "No preview"}
          </div>
        )}
        {onOpenDetail ? (
          <span
            style={{
              position: "absolute",
              top: 6,
              right: 6,
              fontSize: 10,
              fontWeight: 700,
              padding: "3px 7px",
              borderRadius: 6,
              background: "rgba(15,23,42,0.75)",
              color: "#fff",
              pointerEvents: "none",
            }}
          >
            Inspect
          </span>
        ) : null}
      </div>
      <div
        title={fullPathTitle}
        style={{
          marginTop: poolMode ? 6 : 8,
          fontSize: poolMode ? 10 : 11,
          fontWeight: 600,
          color: "#0f172a",
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap",
        }}
      >
        {nameShown}
      </div>
      {!poolMode ? (
        <>
          <div
            title={sourcePath || ""}
            style={{
              marginTop: 4,
              fontSize: 10,
              color: "#64748b",
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}
          >
            {sourcePath ? truncateMiddle(sourcePath, Math.max(48, filenameMaxLen * 2)) : "—"}
          </div>
          <div style={{ marginTop: 6, display: "flex", gap: 4, flexWrap: "wrap" }}>
            {sourceType ? (
              <span style={{ fontSize: 9, padding: "2px 6px", borderRadius: 999, background: "#f1f5f9", color: "#334155" }}>{sourceType}</span>
            ) : null}
            {confidenceLabel ? (
              <span style={{ fontSize: 9, padding: "2px 6px", borderRadius: 999, background: "#eef2ff", color: "#3730a3" }}>{confidenceLabel}</span>
            ) : null}
          </div>
          {badges.length > 0 ? (
            <div style={{ marginTop: 6, display: "flex", flexWrap: "wrap", gap: 4 }}>
              {badges.slice(0, 2).map((b) => (
                <span key={b} style={{ fontSize: 9, padding: "2px 6px", borderRadius: 999, background: "#eef2ff", color: "#3730a3" }} title={b}>
                  {b}
                </span>
              ))}
            </div>
          ) : null}
        </>
      ) : confidenceLabel ? (
        <div style={{ marginTop: 4 }}>
          <span style={{ fontSize: 9, padding: "2px 6px", borderRadius: 999, background: "#eef2ff", color: "#3730a3" }}>{confidenceLabel}</span>
        </div>
      ) : null}
      {assignedControlsAboveDrag ? children : null}
      {canDrag ? (
        <div
          aria-hidden
          title="Drag to assign"
          style={{
            marginTop: poolMode ? 6 : 8,
            padding: poolMode ? "5px 8px" : "8px 10px",
            borderRadius: 8,
            border: "1px solid #cbd5e1",
            background: isDragging ? "#bfdbfe" : "#f1f5f9",
            fontSize: 10,
            fontWeight: 700,
            color: "#475569",
            cursor: isDragging ? "grabbing" : "grab",
            textAlign: "center",
          }}
        >
          {poolMode ? "⋮⋮" : "⋮⋮ Drag"}
        </div>
      ) : null}
      {!assignedControlsAboveDrag ? children : null}
    </div>
  )
}
