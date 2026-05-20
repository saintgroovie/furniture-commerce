"use client"

import type { V2RoleSlot } from "./legacy-board-v2-types"

const SLOT_LABEL: Record<V2RoleSlot, string> = {
  main: "Главное",
  front_anfas: "Анфас",
  front_3_4: "3/4",
  interior: "Внутри",
  detail: "Деталь",
  lifestyle: "Lifestyle",
  scheme: "Схема",
}

type Props = {
  missingSlots: V2RoleSlot[]
  onFocusRole: (slot: V2RoleSlot) => void
}

export function MissingRoleStrip({ missingSlots, onFocusRole }: Props) {
  return (
    <div style={styles.strip}>
      {missingSlots.length === 0 ? (
        <span style={styles.allDone}>✓ Все роли заполнены</span>
      ) : (
        <>
          <span style={styles.prefix}>⚠ Не заполнены:</span>
          {missingSlots.map((slot) => (
            <button
              key={slot}
              style={styles.chip}
              onClick={() => onFocusRole(slot)}
              title={`Фильтровать пул по «${SLOT_LABEL[slot]}»`}
            >
              {SLOT_LABEL[slot]}
            </button>
          ))}
        </>
      )}
    </div>
  )
}

const styles = {
  strip: {
    display: "flex",
    flexWrap: "wrap" as const,
    alignItems: "center",
    gap: "5px",
    padding: "7px 14px",
    background: "#fff8f0",
    borderTop: "1px solid #ffe0b2",
    flexShrink: 0,
    minHeight: "36px",
  },
  prefix: {
    fontSize: "11px",
    color: "#a06000",
    fontWeight: 600,
    flexShrink: 0,
  },
  chip: {
    padding: "2px 8px",
    fontSize: "11px",
    border: "1px solid #e09000",
    borderRadius: "10px",
    background: "#fff3d6",
    color: "#7a4800",
    cursor: "pointer",
    fontWeight: 500,
  },
  allDone: {
    fontSize: "11px",
    color: "#2d7a2d",
    fontWeight: 600,
  },
} as const
