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
  const shortname = inv.filename.length > 22 ? inv.filename.slice(0, 19) + "…" : inv.filename

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
            <span style={{ fontSize: "16px", color: "#ccc" }}>–</span>
          </div>
        )}
      </div>
      <div style={styles.meta}>
        <span style={styles.roleBadge}>{roleLabel}</span>
        <span style={styles.fname} title={inv.filename}>{shortname}</span>
      </div>
      <button
        style={styles.removeBtn}
        onClick={() => onRemove(mediaId)}
        title="Убрать из галереи"
        aria-label="Убрать"
      >
        ×
      </button>
    </div>
  )
}

type Props = {
  galleryIds: string[]
  invById: Map<string, InvItem>
  onRemove: (mediaId: string) => void
}

export function GalleryStrip({ galleryIds, invById, onRemove }: Props) {
  return (
    <div style={styles.strip}>
      <div style={styles.label}>Галерея</div>
      {galleryIds.length === 0 ? (
        <div style={styles.empty}>Нет добавленных элементов</div>
      ) : (
        <div style={styles.scroll}>
          {galleryIds.map((mediaId) => {
            const inv = invById.get(mediaId)
            if (!inv) return null
            return (
              <GalleryItem key={mediaId} mediaId={mediaId} inv={inv} onRemove={onRemove} />
            )
          })}
        </div>
      )}
    </div>
  )
}

const styles = {
  strip: {
    borderBottom: "1px solid #eee",
    flexShrink: 0,
    maxHeight: "140px",
    display: "flex",
    flexDirection: "column" as const,
  },
  label: {
    padding: "5px 14px 3px",
    fontSize: "10px",
    fontWeight: 700,
    textTransform: "uppercase" as const,
    letterSpacing: "0.06em",
    color: "#888",
    flexShrink: 0,
  },
  empty: {
    padding: "8px 14px",
    fontSize: "12px",
    color: "#bbb",
  },
  scroll: {
    display: "flex",
    gap: "6px",
    padding: "5px 12px 8px",
    overflowX: "auto" as const,
    flex: 1,
  },
  item: {
    display: "flex",
    flexDirection: "column" as const,
    alignItems: "center",
    position: "relative" as const,
    width: "72px",
    flexShrink: 0,
  },
  thumb: {
    width: "64px",
    height: "64px",
    border: "1px solid #e0e0e0",
    borderRadius: "4px",
    overflow: "hidden",
    background: "#f5f5f5",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
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
  meta: {
    display: "flex",
    flexDirection: "column" as const,
    alignItems: "center",
    gap: "1px",
    marginTop: "3px",
    width: "100%",
  },
  roleBadge: {
    fontSize: "9px",
    background: "#e8f0ff",
    color: "#1a3a6e",
    borderRadius: "3px",
    padding: "1px 4px",
    fontWeight: 600,
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
  removeBtn: {
    position: "absolute" as const,
    top: "-4px",
    right: "-4px",
    width: "16px",
    height: "16px",
    borderRadius: "50%",
    border: "1px solid #ccc",
    background: "#fff",
    fontSize: "12px",
    lineHeight: "14px",
    textAlign: "center" as const,
    cursor: "pointer",
    color: "#888",
    padding: 0,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
  },
} as const
