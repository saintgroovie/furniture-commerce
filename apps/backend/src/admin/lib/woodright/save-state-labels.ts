import type { SaveStatus } from "../product-workspace/types"

/**
 * Package F (F-14) — shared Russian save-state labels.
 * Single source for every surface that reports save progress; keep in sync
 * with the SaveStatus union in product-workspace/types.
 */
export const SAVE_STATE_LABELS: Record<SaveStatus, string> = {
  clean: "Все изменения сохранены",
  dirty: "Есть несохранённые изменения",
  saving: "Сохраняем…",
  saved: "Изменения сохранены",
  error: "Не удалось сохранить",
  conflict: "Товар был изменён в другой вкладке",
}

export function saveStateLabel(status: SaveStatus): string {
  return SAVE_STATE_LABELS[status] ?? SAVE_STATE_LABELS.clean
}
