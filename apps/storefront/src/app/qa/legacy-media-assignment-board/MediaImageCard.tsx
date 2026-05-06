"use client"

import { useState } from "react"
import type { InvItem } from "./legacy-media-board-types"

type CardSize = "compact" | "normal" | "large"

type Props = {
  inventoryId: string
  inv: InvItem
  previewUrl: string | null
  useImg: boolean
  caption: string
  badges?: string[]
  size?: CardSize
  draggable?: boolean
  onDragStart?: (e: React.DragEvent) => void
  onDragEnd?: (e: React.DragEvent) => void
  /** Full path / context for hover (not shown inline). */
  detailTitle?: string
  /** Max visible filename characters before ellipsis. */
  filenameMaxLen?: number
  onOpenDetail?: () => void
  children?: React.ReactNode
}

const cardPx: Record<CardSize, number> = { compact: 88, normal: 120, large: 160 }

function truncateMiddle(s: string, max: number) {
  if (s.length <= max) return s
  const half = Math.floor((max - 1) / 2)
  return `${s.slice(0, half)}…${s.slice(s.length - half)}`
}

export function MediaImageCard({
  inventoryId,
  inv,
  previewUrl,
  useImg,
  caption,
  badges = [],
  size = "normal",
  draggable = true,
  onDragStart,
  onDragEnd,
  detailTitle,
  filenameMaxLen = 32,
  onOpenDetail,
  children,
}: Props) {
  const w = cardPx[size]
  const [imgBroken, setImgBroken] = useState(false)
  const showImg = useImg && previewUrl && !imgBroken
  const fullPathTitle = detailTitle ?? inv.source_path ?? inv.repo_relative_path ?? inv.filename
  const nameShown = truncateMiddle(inv.filename, filenameMaxLen)

  return (
    <div
      data-inventory-id={inventoryId}
      draggable={draggable}
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      onDragOver={(e) => {
        if (draggable) e.preventDefault()
      }}
      style={{
        width: w + 16,
        borderRadius: 12,
        border: "1px solid #e2e8f0",
        background: "#fff",
        boxShadow: "0 1px 2px rgba(15,23,42,0.06)",
        padding: size === "large" ? 10 : 8,
        cursor: draggable ? "grab" : "default",
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
            style={{ objectFit: "cover", display: "block" }}
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
            fontSize: size === "large" ? 11 : size === "compact" ? 9 : 10,
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
          fontSize: size === "large" ? 12 : size === "compact" ? 10 : 11,
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
      {children}
    </div>
  )
}
