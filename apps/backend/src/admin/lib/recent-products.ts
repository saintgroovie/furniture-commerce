const STORAGE_KEY = "woodright.recent"
const MAX_RECENT = 5

function isBrowser(): boolean {
  return typeof window !== "undefined" && typeof window.localStorage !== "undefined"
}

export function readRecentProductIds(): string[] {
  if (!isBrowser()) return []
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (!raw) return []
    const parsed: unknown = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    const ids = parsed.filter((id): id is string => typeof id === "string" && id.trim().length > 0)
    return [...new Set(ids)].slice(0, MAX_RECENT)
  } catch {
    return []
  }
}

export function recordRecentProductId(id: string): void {
  if (!isBrowser()) return
  const trimmed = id.trim()
  if (!trimmed) return
  try {
    const next = [trimmed, ...readRecentProductIds().filter((item) => item !== trimmed)].slice(
      0,
      MAX_RECENT
    )
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next))
  } catch {
    // Quota or private mode: Workspace must keep working.
  }
}
