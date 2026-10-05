export type EventIconName =
  | "call"
  | "meeting"
  | "message"
  | "note"
  | "follow"
  | "request"
  | "assignee"
  | "link"
  | "order"
  | "make"
  | "image"
  | "alert"
  | "catalog"

const PATHS: Record<EventIconName, string> = {
  call: "M3 3.5h2.2l1 2.4-1.3 1a9 9 0 0 0 4.2 4.2l1-1.3 2.4 1V13a1 1 0 0 1-1 1A11.5 11.5 0 0 1 2 3.5a1 1 0 0 1 1-1Z",
  meeting: "M2 4.5h8.5v6H2zM10.5 6.5H14v4h-3.5M5 12.5v1.5M7.5 12.5v1.5M4 14h5",
  message: "M2.5 3.5h11v8h-7l-3 2.2V11.5h-1z",
  note: "M4 2.5h6l3 3V13.5H4zM10 2.5V5.5h3",
  follow: "M8 2.5v4l2.5 1.5M8 14.5a6 6 0 1 0 0-12",
  request: "M3 3.5h10v9H3zM5 6.5h6M5 9h4",
  assignee: "M8 8.2a2.4 2.4 0 1 0 0-4.8 2.4 2.4 0 0 0 0 4.8ZM3.5 13.5c.6-1.8 2.2-2.8 4.5-2.8s3.9 1 4.5 2.8",
  link: "M6.5 9.5 5 11a2.2 2.2 0 0 1-3.1-3.1L3.4 6.4M9.5 6.5 11 5a2.2 2.2 0 0 1 3.1 3.1L12.6 9.6M6 10l4-4",
  order: "M3 4.5h10l-1 8H4zM6 4.5a2 2 0 0 1 4 0",
  make: "M2.5 11.5 6 4.5l2 3 2-4 3.5 8z",
  image: "M2.5 3.5h11v9h-11zM2.5 10l3-2.5 2 1.8 2.2-2.3 3.3 3",
  alert: "M8 2.8 14 13.2H2zM8 6.5v3.2M8 11.6h.01",
  catalog: "M3 3.5h4.2v4.2H3zM8.8 3.5H13v4.2H8.8zM3 8.8h4.2V13H3zM8.8 8.8H13V13H8.8z",
}

export function EventIcon({ name }: { name: EventIconName }) {
  return (
    <svg className="event-icon" viewBox="0 0 16 16" width="16" height="16" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
      <path d={PATHS[name]} />
    </svg>
  )
}

export function todayIcon(kind: string): EventIconName {
  if (kind === "follow_up") return "follow"
  if (kind === "request") return "request"
  if (kind === "production") return "order"
  if (kind === "catalog") return "catalog"
  return "alert"
}

export function activityIcon(kind: string, text = ""): EventIconName {
  if (text.startsWith("Звонок") || kind === "Звонок") return "call"
  if (text.startsWith("Встреча") || kind === "Встреча") return "meeting"
  if (text.startsWith("Сообщение") || kind === "Сообщение") return "message"
  if (kind === "Заметка" || kind === "Заметка команде") return "note"
  if (kind === "Напоминание") return "follow"
  if (kind === "Заявка") return "request"
  if (kind === "Ответственный") return "assignee"
  if (kind === "Оплата") return "order"
  if (kind === "Доставка" || kind === "Этап") return "make"
  if (kind === "Заказ") return "order"
  if (kind === "Компания") return "link"
  return "note"
}
