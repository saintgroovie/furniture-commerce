"use client"

import { useState } from "react"
import type { InvItem } from "./legacy-board-v2-types"
import { classifyVisualRole, VISUAL_ROLE_BADGE_RU } from "@/app/qa/legacy-media-assignment-board/legacy-media-visual-role-ranking"
import { clientPreview } from "./MediaCardV2"

type GalleryItemProps = {
  mediaId: string
  inv: InvItem
  onRemove: (mediaId: string) => void
}

function GalleryItem({ mediaId, inv, onRemove }: GalleryItemProps) {
  const [imgFailed, setImgFailed] = useState(false)
  const preview = clientPreview(inv)
  const role = classifyVisualRole(inv)
  const roleLabel = VISUAL_ROLE_BADGE_RU[role] ?? "?"
  const showImg = preview.url !== null && !imgFailed
  const shortname = inv.filename.length > 20 ? inv.filename.slice(0, 17) + "…" : inv.filename

  return (
    <div style={styles.item}>
      <div style={styles.thumb}>
        {showImg ? (
          <img
            src={preview.url!}
            alt={inv.filename}
            style={styles.img}
            loading="lazy"
            onError={() => setImgFailed(true)}
          />
        ) : (
          <div style={styles.noImg}>
            <span style={{ fontSize: "18px", color: "#ddd" }}>–</span>
          </div>
        )}
        <button
          style={styles.removeBtn}
          onClick={() => onRemove(mediaId)}
          title="Убрать из галереи"
          aria-label="Убрать"
        >
          ×
        </button>
      </div>
      <div style={styles.meta}>
        <span style={styles.roleBadge}>{roleLabel}</span>
        <span style={styles.fname} title={inv.filename}>{shortname}</span>
      </div>
    </div>
  )
}

type Props = {
  galleryIds: string[]
  invById: Map<string, InvItem>
  onRemove: (mediaId: string) => void
}

export function GalleryStrip({ galleryIds, invById, onRemove }: Props) {
  if (galleryIds.length === 0) return null

  return (
    <div style={styles.strip}>
      <div style={styles.header}>
        <span style={styles.label}>Галерея</span>
        <span style={styles.count}>{galleryIds.length} фото</span>
      </div>
      <div style={styles.scroll}>
        {galleryIds.map((mediaId) => {
          const inv = invById.get(mediaId)
          if (!inv) return null
          return (
            <GalleryItem key={mediaId} mediaId={mediaId} inv={inv} onRemove={onRemove} />
          )
        })}
      </div>
    </div>
  )
}

const styles = {
  strip: {
    borderBottom: "1px solid #eee",
    flexShrink: 0,
    background: "#fff",
  },
  header: {
    display: "flex",
    alignItems: "center",
    gap: "8px",
    padding: "6px 14px 4px",
  },
  label: {
    fontSize: "10px",
    fontWeight: 700,
    textTransform: "uppercase" as const,
    letterSpacing: "0.06em",
    color: "#888",
  },
  count: {
    fontSize: "10px",
    background: "#e0eecc",
    color: "#335500",
    borderRadius: "8px",
    padding: "1px 6px",
    fontWeight: 600,
  },
  scroll: {
    display: "flex",
    gap: "8px",
    padding: "5px 14px 10px",
    overflowX: "auto" as const,
  },
  item: {
    display: "flex",
    flexDirection: "column" as const,
    alignItems: "center",
    gap: "3px",
    flexShrink: 0,
    width: "80px",
  },
  thumb: {
    width: "80px",
    height: "80px",
    border: "1px solid #e0e0e0",
    borderRadius: "5px",
    overflow: "hidden",
    background: "#f5f5f5",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    position: "relative" as const,
  },
  img: {
    width: "100%",
    height: "100%",
    objectFit: "contain" as const,
    display: "block",
  },
  noImg: {
    width: "100%",
    height: "100%",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
  },
  removeBtn: {
    position: "absolute" as const,
    top: "3px",
    right: "3px",
    width: "18px",
    height: "18px",
    borderRadius: "50%",
    border: "1px solid rgba(0,0,0,0.15)",
    background: "rgba(255,255,255,0.9)",
    fontSize: "13px",
    cursor: "pointer",
    color: "#a33",
    fontWeight: 700,
    padding: 0,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    lineHeight: 1,
  },
  meta: {
    display: "flex",
    flexDirection: "column" as const,
    alignItems: "center",
    gap: "2px",
    width: "100%",
  },
  roleBadge: {
    fontSize: "9px",
    background: "#e8f0ff",
    color: "#1a3a6e",
    borderRadius: "3px",
    padding: "1px 5px",
    fontWeight: 700,
  },
  fname: {
    fontSize: "9px",
    color: "#aaa",
    textAlign: "center" as const,
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap" as const,
    width: "100%",
  },
} as const
