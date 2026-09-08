/**
 * Promotion Window rotation - pure state machine (unit-testable without React).
 *
 * Rules:
 * - 1 item → static (no autoplay, no indicators).
 * - ≥2 items → cycle every `intervalMs` (clamped 6000..8000).
 * - Paused while the pointer hovers, the card has focus, the tab is hidden,
 *   or the user prefers reduced motion (then the card is static on the first
 *   item and only manual indicator clicks change it).
 * - Manual selection resets the timer.
 */

export const ROTATION_MIN_MS = 6000
export const ROTATION_MAX_MS = 8000
export const ROTATION_DEFAULT_MS = 7000

export type RotationState = {
  index: number
  count: number
  hovered: boolean
  focused: boolean
  hidden: boolean
  reducedMotion: boolean
}

export type RotationEvent =
  | { type: "tick" }
  | { type: "select"; index: number }
  | { type: "hover"; value: boolean }
  | { type: "focus"; value: boolean }
  | { type: "visibility"; hidden: boolean }
  | { type: "reduced_motion"; value: boolean }
  | { type: "count"; count: number }

export function clampRotationInterval(ms: unknown): number {
  const n = typeof ms === "number" && Number.isFinite(ms) ? ms : ROTATION_DEFAULT_MS
  return Math.min(ROTATION_MAX_MS, Math.max(ROTATION_MIN_MS, Math.round(n)))
}

export function initialRotationState(count: number, reducedMotion = false): RotationState {
  return {
    index: 0,
    count: Math.max(0, count),
    hovered: false,
    focused: false,
    hidden: false,
    reducedMotion,
  }
}

/** Autoplay allowed right now? */
export function isRotationRunning(state: RotationState): boolean {
  return (
    state.count > 1 &&
    !state.hovered &&
    !state.focused &&
    !state.hidden &&
    !state.reducedMotion
  )
}

export function rotationReducer(state: RotationState, event: RotationEvent): RotationState {
  switch (event.type) {
    case "tick":
      if (!isRotationRunning(state)) return state
      return { ...state, index: (state.index + 1) % state.count }
    case "select": {
      if (state.count === 0) return state
      const index = ((event.index % state.count) + state.count) % state.count
      return index === state.index ? state : { ...state, index }
    }
    case "hover":
      return state.hovered === event.value ? state : { ...state, hovered: event.value }
    case "focus":
      return state.focused === event.value ? state : { ...state, focused: event.value }
    case "visibility":
      return state.hidden === event.hidden ? state : { ...state, hidden: event.hidden }
    case "reduced_motion":
      return state.reducedMotion === event.value
        ? state
        : { ...state, reducedMotion: event.value }
    case "count": {
      const count = Math.max(0, event.count)
      if (count === state.count) return state
      return { ...state, count, index: count === 0 ? 0 : Math.min(state.index, count - 1) }
    }
    default:
      return state
  }
}
