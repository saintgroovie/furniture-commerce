export type ActivitySourceName =
  | "note"
  | "contact"
  | "follow_up"
  | "request"
  | "order"
  | "company"
  | "audit"
  | "manufacturing"

export type ActivityLine = {
  id: string
  at: string | null
  source: ActivitySourceName
  text: string
}

const AUDIT_TEXT: Record<string, string> = {
  customer_linked: "Покупатель магазина связан",
  customer_unlinked: "Связь с покупателем снята",
  assignee_set: "Ответственный изменён",
  role_added: "Роль добавлена",
  role_removed: "Роль снята",
  company_linked: "Компания связана",
  company_unlinked: "Компания отвязана",
  follow_up_opened: "Напоминание поставлено",
  follow_up_updated: "Напоминание обновлено",
  person_note_added: "Заметка добавлена",
  person_contact_logged: "Контакт зафиксирован",
  request_updated: "Заявка обновлена",
}

export function auditActionText(action: string): string {
  return AUDIT_TEXT[action] ?? "Изменение"
}

export function manufacturingText(eventType: string): string {
  if (eventType === "note_updated") return "Заметка по заказу"
  if (eventType === "assignee_changed") return "Ответственный по заказу"
  if (eventType === "stage_changed") return "Этап заказа"
  return "Событие заказа"
}

/** Read projection. Does not persist a second activity log. */
export function projectActivity(lines: ActivityLine[]): ActivityLine[] {
  return lines
    .filter((line) => line.text.trim().length > 0)
    .sort((a, b) => (b.at ?? "").localeCompare(a.at ?? ""))
}
