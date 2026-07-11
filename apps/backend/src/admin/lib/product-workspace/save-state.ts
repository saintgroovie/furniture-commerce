import type { EditableProductFields, SaveStatus } from "./types"

export type SaveState = {
  status: SaveStatus
  baseline: EditableProductFields
  draft: EditableProductFields
  errorMessage: string | null
  lastSavedAt: string | null
}

export type SaveAction =
  | { type: "hydrate"; fields: EditableProductFields; savedAt?: string | null }
  | { type: "edit"; patch: Partial<EditableProductFields> }
  | { type: "save_start" }
  | { type: "save_success"; fields: EditableProductFields; savedAt?: string | null }
  | { type: "save_error"; message: string }
  | { type: "conflict"; message?: string }
  | { type: "reset_to_baseline" }

export function createSaveState(fields: EditableProductFields): SaveState {
  return {
    status: "clean",
    baseline: { ...fields },
    draft: { ...fields },
    errorMessage: null,
    lastSavedAt: null,
  }
}

export function isDirty(state: SaveState): boolean {
  return (
    state.draft.title !== state.baseline.title ||
    state.draft.description !== state.baseline.description ||
    state.draft.status !== state.baseline.status
  )
}

export function saveStatusLabel(status: SaveStatus): string {
  switch (status) {
    case "clean":
      return "Все изменения сохранены"
    case "dirty":
      return "Есть несохранённые изменения"
    case "saving":
      return "Сохраняем…"
    case "saved":
      return "Изменения сохранены"
    case "error":
      return "Не удалось сохранить"
    case "conflict":
      return "Товар был изменён в другой вкладке"
    default:
      return "Все изменения сохранены"
  }
}

export function reduceSaveState(state: SaveState, action: SaveAction): SaveState {
  switch (action.type) {
    case "hydrate":
      return {
        status: "clean",
        baseline: { ...action.fields },
        draft: { ...action.fields },
        errorMessage: null,
        lastSavedAt: action.savedAt ?? state.lastSavedAt,
      }
    case "edit": {
      const draft = { ...state.draft, ...action.patch }
      const next: SaveState = {
        ...state,
        draft,
        errorMessage: null,
      }
      next.status = isDirty(next) ? "dirty" : "clean"
      return next
    }
    case "save_start":
      return { ...state, status: "saving", errorMessage: null }
    case "save_success":
      return {
        status: "saved",
        baseline: { ...action.fields },
        draft: { ...action.fields },
        errorMessage: null,
        lastSavedAt: action.savedAt ?? new Date().toISOString(),
      }
    case "save_error":
      return { ...state, status: "error", errorMessage: action.message }
    case "conflict":
      return {
        ...state,
        status: "conflict",
        errorMessage:
          action.message ??
          "Товар был изменён в другой вкладке. Обновите страницу, чтобы не затереть чужие правки.",
      }
    case "reset_to_baseline":
      return {
        ...state,
        draft: { ...state.baseline },
        status: "clean",
        errorMessage: null,
      }
    default:
      return state
  }
}
