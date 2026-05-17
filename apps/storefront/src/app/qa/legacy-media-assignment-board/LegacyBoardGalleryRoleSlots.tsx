"use client"

import type { CSSProperties, ReactNode } from "react"
import type { GalleryRoleSlotCell } from "@/lib/qa/legacy-board-operator-role-overrides"
import { roleSlotEmptyPlaceholder } from "@/lib/qa/legacy-board-operator-role-overrides"

type BorrowedMeta = { fromVariantKey: string; fromVariantLabel: string }

type Props = {
  slots: GalleryRoleSlotCell[]
  overflowMediaIds: string[]
  renderThumb: (mediaId: string, zone: "gallery") => ReactNode
  borrowedMeta?: Record<string, BorrowedMeta>
  onRemoveBorrowed?: (mediaId: string) => void
  onReplaceBorrowed?: (mediaId: string) => void
  slotGridStyle?: CSSProperties
}

export function LegacyBoardGalleryRoleSlots({
  slots,
  overflowMediaIds,
  renderThumb,
  borrowedMeta,
  onRemoveBorrowed,
  onReplaceBorrowed,
  slotGridStyle,
}: Props) {
  return (
    <div
      data-gallery-role-slots="true"
      style={{
        display: "grid",
        gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))",
        gap: 12,
        width: "100%",
        minWidth: 0,
        ...slotGridStyle,
      }}
    >
      {slots.map((slot) => (
        <section
          key={slot.slotKey}
          data-role-slot="true"
          data-role-slot-name={slot.slotKey}
          style={{
            border: slot.isEmpty ? "1px dashed #cbd5e1" : "1px solid #e2e8f0",
            borderRadius: 10,
            padding: 10,
            background: slot.isEmpty ? "#f8fafc" : "#fff",
            minWidth: 0,
            display: "flex",
            flexDirection: "column",
            gap: 8,
          }}
        >
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 6 }}>
            <strong style={{ fontSize: 12, color: "#0f172a" }}>{slot.label}</strong>
            {slot.mediaIds.length > 1 ? (
              <span style={{ fontSize: 10, color: "#64748b" }}>+{slot.mediaIds.length - 1}</span>
            ) : null}
          </div>
          {slot.isEmpty ? (
            <div data-role-slot-empty="true" style={{ fontSize: 11, color: "#64748b", lineHeight: 1.45, minHeight: 72 }}>
              {roleSlotEmptyPlaceholder(slot.placeholderTitle)}
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {slot.mediaIds.map((mediaId, idx) => {
                const borrowed = borrowedMeta?.[mediaId]
                return (
                  <div key={`${slot.slotKey}-${mediaId}`} style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                    {borrowed ? (
                      <div
                        data-borrowed-from-color="true"
                        style={{
                          fontSize: 11,
                          color: "#9a3412",
                          background: "#fff7ed",
                          border: "1px solid #fdba74",
                          borderRadius: 8,
                          padding: "6px 8px",
                          lineHeight: 1.4,
                        }}
                      >
                        <div style={{ fontWeight: 700 }}>Использовано из цвета: {borrowed.fromVariantLabel}</div>
                        <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 6 }}>
                          {onReplaceBorrowed ? (
                            <button
                              type="button"
                              data-action-button="borrowed-replace"
                              style={{
                                fontSize: 10,
                                padding: "3px 8px",
                                borderRadius: 6,
                                border: "1px solid #fdba74",
                                background: "#fff",
                                cursor: "pointer",
                              }}
                              onClick={() => onReplaceBorrowed(mediaId)}
                            >
                              Заменить
                            </button>
                          ) : null}
                          {onRemoveBorrowed ? (
                            <button
                              type="button"
                              data-action-button="borrowed-remove"
                              style={{
                                fontSize: 10,
                                padding: "3px 8px",
                                borderRadius: 6,
                                border: "1px solid #fecaca",
                                background: "#fff",
                                color: "#b91c1c",
                                cursor: "pointer",
                              }}
                              onClick={() => onRemoveBorrowed(mediaId)}
                            >
                              Убрать
                            </button>
                          ) : null}
                        </div>
                      </div>
                    ) : null}
                    {renderThumb(mediaId, "gallery")}
                    {idx < slot.mediaIds.length - 1 ? (
                      <hr style={{ border: "none", borderTop: "1px solid #f1f5f9", margin: 0 }} />
                    ) : null}
                  </div>
                )
              })}
            </div>
          )}
        </section>
      ))}
      {overflowMediaIds.length > 0 ? (
        <section
          data-role-slot="true"
          data-role-slot-name="overflow"
          style={{
            border: "1px solid #e2e8f0",
            borderRadius: 10,
            padding: 10,
            background: "#fff",
            gridColumn: "1 / -1",
          }}
        >
          <strong style={{ fontSize: 12, color: "#64748b" }}>Прочие фото · {overflowMediaIds.length}</strong>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 12, marginTop: 8 }}>
            {overflowMediaIds.map((mediaId) => (
              <div key={mediaId} style={{ flex: "0 0 196px", maxWidth: 196 }}>
                {renderThumb(mediaId, "gallery")}
              </div>
            ))}
          </div>
        </section>
      ) : null}
    </div>
  )
}
