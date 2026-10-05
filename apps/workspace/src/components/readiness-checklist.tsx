import type { ChecklistItem } from "@/lib/product-presentation"
import { Status } from "@/components/status"

export function ReadinessChecklist({ items }: { items: ChecklistItem[] }) {
  return (
    <ul className="checklist">
      {items.map((item) => (
        <li key={item.code} className="checklist-item">
          <Status tone={item.ok ? "positive" : item.note ? "attention" : "critical"} size="lg">
            {item.ok ? "Готово" : "Нет"} · {item.label}
          </Status>
          {item.note ? <span className="meta">{item.note}</span> : null}
        </li>
      ))}
    </ul>
  )
}
