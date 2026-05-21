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
  if (missingSlots.length === 0) {
    return (
      <div style={styles.stripDone}>
        <span style={styles.doneIcon}>✓</span>
        <span style={styles.doneText}>Все роли заполнены — продукт готов к экспорту</span>
      </div>
    )
  }

  return (
    <div style={styles.strip}>
      <div style={styles.headerRow}>
        <span style={styles.warningIcon}>⚠</span>
        <span style={styles.label}>Нужно заполнить:</span>
      </div>
      <div style={styles.chipRow}>
        {missingSlots.map((slot) => (
          <button
            key={slot}
            style={styles.chip}
            onClick={() => onFocusRole(slot)}
            title={`Показать «${SLOT_LABEL[slot]}» в пуле`}
          >
            {SLOT_LABEL[slot]}
            <span style={styles.chipArrow}>→</span>
          </button>
        ))}
      </div>
    </div>
  )
}

const styles = {
  strip: {
    padding: "8px 14px 10px",
    background: "#fffbf0",
    borderTop: "1px solid #ffd54f",
    borderBottom: "1px solid #ffd54f",
    flexShrink: 0,
  },
  stripDone: {
    display: "flex",
    alignItems: "center",
    gap: "8px",
    padding: "8px 14px",
    background: "#f0fff4",
    borderTop: "1px solid #c8e6c9",
    borderBottom: "1px solid #c8e6c9",
    flexShrink: 0,
  },
  doneIcon: {
    fontSize: "16px",
    color: "#2d7a2d",
    fontWeight: 700,
  },
  doneText: {
    fontSize: "12px",
    color: "#2d7a2d",
    fontWeight: 600,
  },
  headerRow: {
    display: "flex",
    alignItems: "center",
    gap: "6px",
    marginBottom: "6px",
  },
  warningIcon: {
    fontSize: "14px",
    color: "#e07800",
  },
  label: {
    fontSize: "11px",
    color: "#7a4800",
    fontWeight: 700,
    textTransform: "uppercase" as const,
    letterSpacing: "0.04em",
  },
  chipRow: {
    display: "flex",
    flexWrap: "wrap" as const,
    gap: "5px",
  },
  chip: {
    display: "inline-flex",
    alignItems: "center",
    gap: "4px",
    padding: "4px 10px",
    fontSize: "11px",
    border: "1px solid #f0a000",
    borderRadius: "12px",
    background: "#fff",
    color: "#7a3800",
    cursor: "pointer",
    fontWeight: 600,
    lineHeight: 1.3,
    transition: "background 0.1s",
  },
  chipArrow: {
    fontSize: "10px",
    color: "#e07800",
    fontWeight: 700,
  },
} as const
