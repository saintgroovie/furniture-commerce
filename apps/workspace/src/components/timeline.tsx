import { activityIcon, EventIcon, type EventIconName } from "@/components/event-icon"
import { formatWhen } from "@/lib/format"

export type TimelineEntry = {
  id: string
  at: string | null
  kind: string
  text: string
  detail?: string | null
  internal?: boolean
  icon?: EventIconName
}

/**
 * One visual projection for events from different backend sources.
 * Internal notes are tinted so they never read as customer communication.
 */
export function Timeline({ items, empty }: { items: TimelineEntry[]; empty: string }) {
  if (items.length === 0) return <p className="meta">{empty}</p>
  return (
    <ol className="timeline">
      {items.map((item, index) => (
        <li key={item.id} className="timeline-item">
          <div className="timeline-rail" aria-hidden="true">
            <span className={`timeline-mark${item.internal ? " internal" : ""}`}>
              <EventIcon name={item.icon ?? activityIcon(item.kind, item.text)} />
            </span>
            {index < items.length - 1 ? <span className="timeline-line" /> : null}
          </div>
          <div className="timeline-body">
            <span className="timeline-title">{item.kind}</span>
            <span className={item.internal ? "internal-note" : undefined}>{item.text}</span>
            <span className="meta">{[item.detail, formatWhen(item.at)].filter(Boolean).join(" · ")}</span>
          </div>
        </li>
      ))}
    </ol>
  )
}
