"use client"

import { useState } from "react"
import type { InvItem } from "./legacy-media-board-types"

type CardSize = "compact" | "normal" | "large" | "xlarge"

type Props = {
  inventoryId: string
  inv: InvItem
  productHandle?: string | null
  previewUrl: string | null
  useImg: boolean
  caption: string
  badges?: string[]
  size?: CardSize
  /** Native HTML5 drag source toggle. */
  draggable?: boolean
  /** Visual feedback while this card is the active drag source (parent-driven). */
  isDragging?: boolean
  /** Drag handlers are attached to the card root. */
  onDragStart?: (e: React.DragEvent) => void
  onDragEnd?: (e: React.DragEvent) => void
  /** Full path / context for hover (not shown inline). */
  detailTitle?: string
  sourcePath?: string | null
  sourceType?: string | null
  confidenceLabel?: string | null
  previewable?: boolean
  /** Max visible filename characters before ellipsis. */
  filenameMaxLen?: number
  /** QA board: lane id (primary / gallery / …) for diagnostics. */
  dataZone?: string | null
  onOpenDetail?: () => void
  onCardPointerDownCapture?: (e: React.PointerEvent) => void
  onCardClickCapture?: (e: React.MouseEvent) => void
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
  children,
}: Props) {
  const w = cardPx[size]
  const [imgBroken, setImgBroken] = useState(false)
  const showImg = useImg && previewUrl && !imgBroken
  const fullPathTitle = detailTitle ?? inv.source_path ?? inv.repo_relative_path ?? inv.filename
  const nameShown = truncateMiddle(inv.filename, filenameMaxLen)

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
        width: w + 16,
        borderRadius: 12,
        border: isDragging ? "2px solid #2563eb" : "1px solid #e2e8f0",
        background: isDragging ? "#eff6ff" : "#fff",
        boxShadow: isDragging ? "0 4px 14px rgba(37,99,235,0.2)" : "0 1px 2px rgba(15,23,42,0.06)",
        padding: size === "xlarge" || size === "large" ? 10 : 8,
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
          width: w,
          height: w,
          borderRadius: 10,
          overflow: "hidden",
          background: "#f1f5f9",
          outline: onOpenDetail ? "none" : undefined,
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
            style={{ objectFit: "cover", display: "block", ...({ WebkitUserDrag: "none" } as Record<string, string>) }}
            onError={() => setImgBroken(true)}
          />
        ) : null}
        <div
          style={{
            display: showImg ? "none" : "flex",
            position: showImg ? "absolute" : "relative",
            inset: 0,
            alignItems: "center",
            justifyContent: "center",
            textAlign: "center",
            padding: 8,
            fontSize: size === "xlarge" || size === "large" ? 11 : size === "compact" ? 9 : 10,
            color: "#475569",
            lineHeight: 1.35,
          }}
        >
          {imgBroken ? "Preview failed" : caption || "No preview"}
        </div>
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
            Details
          </span>
        ) : null}
      </div>
      <div
        title={fullPathTitle}
        style={{
          marginTop: 8,
          fontSize: size === "xlarge" || size === "large" ? 12 : size === "compact" ? 10 : 11,
          fontWeight: 600,
          color: "#0f172a",
          lineHeight: 1.25,
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap",
        }}
      >
        {nameShown}
      </div>
      <div
        title={sourcePath || ""}
        style={{
          marginTop: 4,
          fontSize: 10,
          color: "#64748b",
          lineHeight: 1.25,
          display: "-webkit-box",
          WebkitLineClamp: 2,
          WebkitBoxOrient: "vertical",
          overflow: "hidden",
          wordBreak: "break-all",
          minHeight: 24,
        }}
      >
        {sourcePath || "—"}
      </div>
      <div style={{ marginTop: 6, display: "flex", gap: 4, flexWrap: "wrap" }}>
        {sourceType ? (
          <span style={{ fontSize: 9, padding: "2px 6px", borderRadius: 999, background: "#f1f5f9", color: "#334155" }}>{sourceType}</span>
        ) : null}
        {confidenceLabel ? (
          <span style={{ fontSize: 9, padding: "2px 6px", borderRadius: 999, background: "#eef2ff", color: "#3730a3" }}>{confidenceLabel}</span>
        ) : null}
        <span style={{ fontSize: 9, padding: "2px 6px", borderRadius: 999, background: previewable ? "#dcfce7" : "#fee2e2", color: previewable ? "#166534" : "#991b1b" }}>
          {previewable ? "previewable" : "unpreviewable"}
        </span>
      </div>
      {badges.length > 0 ? (
        <div style={{ marginTop: 8, display: "flex", flexWrap: "wrap", gap: 4 }}>
          {badges.map((b) => (
            <span
              key={b}
              style={{
                fontSize: 9,
                fontWeight: 600,
                textTransform: "uppercase",
                letterSpacing: "0.02em",
                padding: "3px 7px",
                borderRadius: 999,
                background: "#eef2ff",
                color: "#3730a3",
                maxWidth: "100%",
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
              }}
              title={b}
            >
              {b}
            </span>
          ))}
        </div>
      ) : null}
      {canDrag ? (
        <div
          aria-hidden
          style={{
            marginTop: 8,
            padding: "10px 12px",
            minHeight: 40,
            width: "100%",
            boxSizing: "border-box",
            borderRadius: 8,
            border: "1px solid #94a3b8",
            background: isDragging ? "#bfdbfe" : "#e2e8f0",
            fontSize: 12,
            fontWeight: 800,
            color: "#0f172a",
            cursor: isDragging ? "grabbing" : "grab",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: 8,
            flexShrink: 0,
            fontFamily: "inherit",
          }}
        >
          <span aria-hidden style={{ fontSize: 14, lineHeight: 1, letterSpacing: 1 }}>
            ⋮⋮
          </span>
          <span>Drag</span>
        </div>
      ) : null}
      {children}
    </div>
  )
}
