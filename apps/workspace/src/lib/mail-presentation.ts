import type { InboxItem } from "./today-presentation"

export const MAIL_VIEWS = [
  { id: "needs_reply", label: "Требуют ответа" },
  { id: "mine", label: "Мои" },
  { id: "unassigned", label: "Без ответственного" },
  { id: "waiting", label: "Ждём клиента" },
  { id: "closed", label: "Закрытые" },
] as const

export type MailThreadRow = {
  id: string
  subject: string | null
  status: string
  waiting_on: string
  assignee_id: string | null
  lead_id: string | null
  request_id: string | null
  order_id: string | null
  last_message_at?: string | null
}

/** Today asks for mail only after the backend says the mailbox is usable. */
export function todayMailThreads(visible: boolean, threads: MailThreadRow[]): MailThreadRow[] {
  return visible ? threads : []
}

export function mailRowsToInbox(rows: MailThreadRow[]): InboxItem[] {
  return rows
    .filter((row) => row.status === "open" && row.waiting_on === "us")
    .filter((row) => !row.request_id)
    .map((row) => ({
      id: `mail:${row.id}`,
      kind: "mail",
      title: row.subject || "Без темы",
      hint: "Требует ответа",
      action: "Открыть",
      overdue: false,
      href: `/inbox/${row.id}`,
    }))
}

export function applySendResult(draft: string, phase: "sending" | "failed" | "sent"): { phase: "sending" | "failed" | "idle"; draft: string; label: string } {
  if (phase === "sending") return { phase: "sending", draft, label: "Отправляем…" }
  if (phase === "failed") return { phase: "failed", draft, label: "Письмо не отправлено." }
  return { phase: "idle", draft: "", label: "Ответить клиенту" }
}

export function personBanner(input: { leadId: string | null; candidateIds: string[] }): "linked" | "suggested" | "unresolved" | "needs_review" {
  if (input.leadId) return "linked"
  if (input.candidateIds.length > 1) return "needs_review"
  if (input.candidateIds.length === 1) return "suggested"
  return "unresolved"
}

/** Exact normalized address only. A shared subject is not a person match. */
export function exactEmailCandidates(
  people: Array<{ id: string; email: string | null }>,
  sender: string | null
): string[] {
  const needle = sender?.trim().toLowerCase() ?? ""
  if (!needle.includes("@")) return []
  return people.filter((person) => (person.email ?? "").trim().toLowerCase() === needle).map((person) => person.id)
}
