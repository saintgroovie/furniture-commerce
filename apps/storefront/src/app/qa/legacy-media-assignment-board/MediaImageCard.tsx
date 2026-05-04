"use client"

import { useState } from "react"
import type { InvItem } from "./legacy-media-board-types"

type Props = {
  inventoryId: string
  inv: InvItem
  previewUrl: string | null
  useImg: boolean
  caption: string
  badges?: string[]
  compact?: boolean
  draggable?: boolean
  onDragStart?: (e: React.DragEvent) => void
  onDragEnd?: (e: React.DragEvent) => void
  children?: React.ReactNode
}

const cardW = { normal: 112, compact: 88 } as const

export function MediaImageCard({
  inventoryId,
  inv,
  previewUrl,
  useImg,
  caption,
  badges = [],
  compact = false,
  draggable = true,
  onDragStart,
  onDragEnd,
  children,
}: Props) {
  const w = compact ? cardW.compact : cardW.normal
  const [imgBroken, setImgBroken] = useState(false)
  const showImg = useImg && previewUrl && !imgBroken
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
        borderRadius: 10,
        border: "1px solid #e2e8f0",
        background: "#fff",
        boxShadow: "0 1px 2px rgba(15,23,42,0.06)",
        padding: 8,
        cursor: draggable ? "grab" : "default",
      }}
    >
      <div style={{ position: "relative", width: w, height: w, borderRadius: 8, overflow: "hidden", background: "#f1f5f9" }}>
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
            padding: 6,
            fontSize: compact ? 9 : 10,
            color: "#475569",
            lineHeight: 1.25,
          }}
        >
          {imgBroken ? "Preview failed" : caption || "No preview"}
        </div>
      </div>
      <div style={{ marginTop: 6, fontSize: compact ? 10 : 11, fontWeight: 500, color: "#0f172a", wordBreak: "break-word", lineHeight: 1.2 }}>
        {inv.filename}
      </div>
      {badges.length > 0 ? (
        <div style={{ marginTop: 6, display: "flex", flexWrap: "wrap", gap: 4 }}>
          {badges.map((b) => (
            <span
              key={b}
              style={{
                fontSize: 9,
                fontWeight: 600,
                textTransform: "uppercase",
                letterSpacing: "0.02em",
                padding: "2px 6px",
                borderRadius: 999,
                background: "#e0e7ff",
                color: "#3730a3",
              }}
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
