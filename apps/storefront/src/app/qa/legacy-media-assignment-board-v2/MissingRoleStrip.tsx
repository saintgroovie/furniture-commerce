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
        <span style={styles.doneIcon}>◉</span>
        <span style={styles.doneText}>Все роли заполнены — продукт готов к экспорту</span>
      </div>
    )
  }

  return (
    <div style={styles.strip} data-v2-missing-role-strip>
      <span style={styles.warningIcon}>⚠</span>
      <span style={styles.label}>Нужно:</span>
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
    display: "flex",
    alignItems: "center",
    flexWrap: "wrap" as const,
    gap: "4px 6px",
    padding: "4px 12px 5px",
    minHeight: "32px",
    maxHeight: "52px",
    overflow: "hidden" as const,
    background: "#fffbf5",
    borderBottom: "1px solid #f0e6d0",
    flexShrink: 0,
  },
  stripDone: {
    display: "flex",
    alignItems: "center",
    gap: "6px",
    padding: "4px 12px 5px",
    minHeight: "28px",
    background: "#f5fbf6",
    borderBottom: "1px solid #e8f0e8",
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
  warningIcon: {
    fontSize: "12px",
    color: "#e07800",
    flexShrink: 0,
    lineHeight: 1,
  },
  label: {
    fontSize: "10px",
    color: "#7a4800",
    fontWeight: 700,
    textTransform: "uppercase" as const,
    letterSpacing: "0.03em",
    flexShrink: 0,
    whiteSpace: "nowrap" as const,
  },
  chipRow: {
    display: "flex",
    flexWrap: "wrap" as const,
    alignItems: "center",
    gap: "4px",
    flex: "1 1 auto",
    minWidth: 0,
  },
  chip: {
    display: "inline-flex",
    alignItems: "center",
    gap: "3px",
    padding: "3px 7px",
    fontSize: "11px",
    border: "1px solid #e8c878",
    borderRadius: "4px",
    background: "#fff",
    color: "#7a3800",
    cursor: "pointer",
    fontWeight: 600,
    lineHeight: 1.2,
  },
  chipArrow: {
    fontSize: "10px",
    color: "#e07800",
    fontWeight: 700,
  },
} as const
