/**
 * Reject accidental numeric routes like `/1` / `/2` from carousel indices.
 * Presentation-only guard for homepage links.
 */
export function safeInternalHref(
  href: string | null | undefined,
  fallback: string
): string {
  if (typeof href !== "string") return fallback
  const trimmed = href.trim()
  if (!trimmed) return fallback
  if (/^\/?\d+$/.test(trimmed)) return fallback
  if (!trimmed.startsWith("/")) return fallback
  return trimmed
}
