import type { StateView } from "./state"

export type PersonSuggestion = {
  status: string
  customer_ids: string[]
  candidates?: Array<{ id: string; email: string | null; phone: string | null }>
  lookup_incomplete?: boolean
}

export type PersonMatchView =
  | { kind: "unavailable" }
  | { kind: "linked"; customer_id: string }
  | { kind: "incomplete" }
  | { kind: "ambiguous"; candidates: Array<{ id: string; email: string | null; phone: string | null }> }
  | { kind: "candidate"; candidate: { id: string; email: string | null; phone: string | null } }
  | { kind: "none" }

/**
 * Safety semantics preserved: one confirmable candidate may be offered,
 * several candidates require an explicit choice, nothing links on its own.
 */
export function personMatchView(input: {
  linksAvailable: boolean
  linkedCustomerId: string | null | undefined
  suggestion: PersonSuggestion
}): PersonMatchView {
  if (!input.linksAvailable) return { kind: "unavailable" }
  if (input.linkedCustomerId) return { kind: "linked", customer_id: input.linkedCustomerId }
  const suggestion = input.suggestion
  const candidates = suggestion.candidates?.length
    ? suggestion.candidates
    : suggestion.customer_ids.map((id) => ({ id, email: null, phone: null }))
  if (suggestion.lookup_incomplete) return { kind: "incomplete" }
  if (suggestion.status === "needs_review") return { kind: "ambiguous", candidates }
  if (suggestion.status === "candidate" && candidates.length === 1) return { kind: "candidate", candidate: candidates[0]! }
  return { kind: "none" }
}

export function personMatchState(view: PersonMatchView): StateView {
  switch (view.kind) {
    case "linked":
      return { tone: "positive", label: "Покупатель связан" }
    case "ambiguous":
      return { tone: "critical", label: "Нужно проверить связь" }
    case "candidate":
      return { tone: "attention", label: "Есть совпадение" }
    case "incomplete":
      return { tone: "waiting", label: "Проверка совпадений неполная" }
    case "unavailable":
      return { tone: "neutral", label: "Связь пока только просмотр" }
    default:
      return { tone: "neutral", label: "Покупатель не связан" }
  }
}

export function personRole(input: { customer_id?: string | null; request_count?: number; source?: string | null }): string {
  if (input.customer_id) return "Покупатель"
  if ((input.request_count ?? 0) > 0) return "Лид"
  return "Контакт"
}

export const REQUEST_STAGES: Array<{ id: string; label: string }> = [
  { id: "new", label: "Новая" },
  { id: "contacted", label: "Связались" },
  { id: "quote_sent", label: "Расчёт отправлен" },
  { id: "paid", label: "Оплачено" },
  { id: "in_production", label: "В производстве" },
  { id: "completed", label: "Завершена" },
]

export function requestState(status: string | null | undefined): StateView {
  switch (status) {
    case "new":
      return { tone: "attention", label: "Новая" }
    case "contacted":
      return { tone: "neutral", label: "Связались" }
    case "quote_sent":
      return { tone: "waiting", label: "Расчёт отправлен" }
    case "paid":
      return { tone: "positive", label: "Оплачено" }
    case "in_production":
      return { tone: "neutral", label: "В производстве" }
    case "completed":
      return { tone: "positive", label: "Завершена" }
    default:
      return { tone: "neutral", label: status || "Статус не пришёл" }
  }
}

export function nextRequestAction(status: string | null | undefined): string {
  switch (status) {
    case "new":
      return "связаться с клиентом и записать результат"
    case "contacted":
      return "отправить расчёт"
    case "quote_sent":
      return "дождаться ответа клиента"
    case "paid":
      return "передать в производство"
    case "in_production":
      return "дождаться готовности"
    case "completed":
      return "действий не требуется"
    default:
      return "проверить заявку"
  }
}
