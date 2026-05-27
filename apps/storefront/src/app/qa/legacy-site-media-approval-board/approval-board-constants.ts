import type { DuplicateStatus, OperatorRole } from "./approval-board-types"

export const OPERATOR_ROLES: { id: OperatorRole; label: string }[] = [
  { id: "front", label: "Фронт" },
  { id: "front_3_4", label: "3/4" },
  { id: "side", label: "Бок" },
  { id: "detail", label: "Деталь" },
  { id: "interior", label: "Интерьер" },
  { id: "scheme", label: "Схема" },
  { id: "unknown", label: "Не ясно" },
]

export const DUPLICATE_OPTIONS: { id: DuplicateStatus; label: string }[] = [
  { id: "unchecked", label: "Не проверено" },
  { id: "not_duplicate", label: "Не дубль" },
  { id: "possible_duplicate", label: "Возможный дубль" },
  { id: "duplicate_reject", label: "Дубль / не нужен" },
]

export type WorkflowFilter =
  | "all"
  | "approved_without_role"
  | "needs_duplicate_check"
  | "needs_role"

export const WORKFLOW_FILTERS: { id: WorkflowFilter; label: string }[] = [
  { id: "all", label: "Все" },
  { id: "needs_duplicate_check", label: "Нужна проверка дубля" },
  { id: "needs_role", label: "Нужна роль" },
  { id: "approved_without_role", label: "Approve без роли" },
]

export function titleSourceLabel(
  source: "price_list" | "seed_products" | "normalized" | "filename_guess" | "unknown" | string
): string {
  const map: Record<string, string> = {
    price_list: "price_list",
    seed_products: "seed",
    normalized: "normalized",
    filename_guess: "filename_guess",
    unknown: "unknown",
  }
  return map[source] || source
}

export function autoRoleLabel(roleGuess: string | undefined): string {
  if (!roleGuess || roleGuess === "unknown") return "не ясно"
  if (roleGuess === "3/4") return "3/4"
  if (roleGuess === "front") return "фронт"
  return roleGuess
}
