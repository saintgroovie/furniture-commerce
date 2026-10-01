import type { FollowUpEntity } from "./constants"

const MSK = "Europe/Moscow"

/** Calendar date in Moscow, YYYY-MM-DD. */
export function moscowCalendarDate(date: Date): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: MSK,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date)
}

export function addCalendarDays(isoDate: string, days: number): string {
  const [year, month, day] = isoDate.split("-").map((part) => Number(part))
  const utc = new Date(Date.UTC(year, month - 1, day))
  utc.setUTCDate(utc.getUTCDate() + days)
  return utc.toISOString().slice(0, 10)
}

export type FollowUpPreset = "today" | "tomorrow" | "in_3_days"

export function dueOnFromPreset(preset: FollowUpPreset, now: Date): string {
  const today = moscowCalendarDate(now)
  if (preset === "today") return today
  if (preset === "tomorrow") return addCalendarDays(today, 1)
  return addCalendarDays(today, 3)
}

/** Open follow-ups are due on Сегодня when their Moscow date is today or earlier. */
export function isFollowUpDue(dueAt: string | null | undefined, now: Date): boolean {
  if (!dueAt) return false
  const parsed = new Date(dueAt)
  if (!Number.isFinite(parsed.getTime())) return false
  return moscowCalendarDate(parsed) <= moscowCalendarDate(now)
}

export function followUpHref(entityType: FollowUpEntity, entityId: string): string {
  if (entityType === "person") return `/people/${entityId}`
  if (entityType === "request") return `/requests/${entityId}`
  if (entityType === "company") return `/companies/${entityId}`
  return `/orders/${entityId}`
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/

export function dueInstant(isoDate: string): string | null {
  if (!DATE_RE.test(isoDate)) return null
  const [year, month, day] = isoDate.split("-").map((part) => Number(part))
  if (month < 1 || month > 12 || day < 1 || day > 31) return null
  const utc = new Date(Date.UTC(year, month - 1, day))
  if (utc.getUTCFullYear() !== year || utc.getUTCMonth() !== month - 1 || utc.getUTCDate() !== day) return null
  return `${isoDate}T00:00:00.000Z`
}

/** Exclusive upper bound for follow-ups whose stored UTC-midnight date is due. */
export function followUpDueBefore(now: Date): string {
  return `${addCalendarDays(moscowCalendarDate(now), 1)}T00:00:00.000Z`
}
