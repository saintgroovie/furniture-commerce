"use client"

import type { V2RoleFilter } from "./legacy-board-v2-types"

const FILTERS: ReadonlyArray<{ key: V2RoleFilter; label: string }> = [
  { key: "all", label: "Все" },
  { key: "front", label: "Фронт" },
  { key: "3_4", label: "3/4" },
  { key: "interior", label: "Внутри" },
  { key: "detail", label: "Деталь" },
  { key: "lifestyle", label: "Lifestyle" },
  { key: "scheme", label: "Схема" },
  { key: "no_preview", label: "Без превью" },
]

type Props = {
  activeFilter: V2RoleFilter
  counts: Partial<Record<V2RoleFilter, number>>
  onFilter: (filter: V2RoleFilter) => void
}

export function RoleFilterTabs({ activeFilter, counts, onFilter }: Props) {
  return (
    <div style={styles.strip}>
      {FILTERS.map(({ key, label }) => {
        const count = counts[key]
        const isActive = activeFilter === key
        return (
          <button
            key={key}
            onClick={() => onFilter(key)}
            style={{ ...styles.btn, ...(isActive ? styles.btnActive : {}) }}
          >
            {label}
            {count != null && count > 0 && (
              <span style={{ ...styles.count, ...(isActive ? styles.countActive : {}) }}>
                {count}
              </span>
            )}
          </button>
        )
      })}
    </div>
  )
}

const styles = {
  strip: {
    display: "flex",
    flexWrap: "wrap" as const,
    gap: "4px",
    padding: "8px 10px",
    borderBottom: "1px solid #eee",
    background: "#fafafa",
  },
  btn: {
    display: "inline-flex",
    alignItems: "center",
    gap: "4px",
    padding: "3px 8px",
    fontSize: "12px",
    border: "1px solid #ddd",
    borderRadius: "4px",
    background: "#fff",
    color: "#444",
    cursor: "pointer",
    lineHeight: 1.4,
  },
  btnActive: {
    background: "#1a3a6e",
    borderColor: "#1a3a6e",
    color: "#fff",
  },
  count: {
    fontSize: "11px",
    background: "#e8e8e8",
    borderRadius: "8px",
    padding: "0 5px",
    color: "#555",
    minWidth: "16px",
    textAlign: "center" as const,
  },
  countActive: {
    background: "rgba(255,255,255,0.25)",
    color: "#fff",
  },
} as const
