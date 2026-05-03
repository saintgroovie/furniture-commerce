/**
 * Read-only URL classification for QA / audit (no network). Not used to rewrite Medusa paths.
 */

export type StaticExtraUrlDiagnosis =
  | "url_empty_or_invalid"
  | "uploads_path_not_served"
  | "static_path_not_served"
  | "missing_file"
  | "legacy_source_not_materialized"
  | "wrong_path_prefix"
  | "image_object_shape_wrong"
  | "display_group_collected_bad_member_url"
  | "oliver_extra_bad_url"
  | "unknown"

/** Heuristic: relative Medusa paths often break on storefront origin unless proxied. */
export function diagnoseStaticExtraUrl(url: string): StaticExtraUrlDiagnosis {
  const t = typeof url === "string" ? url.trim() : ""
  if (t.length < 2) return "url_empty_or_invalid"
  const lower = t.toLowerCase()
  if (lower === "undefined" || lower === "null" || lower === "[object object]")
    return "url_empty_or_invalid"
  if (/^\s*(javascript|vbscript|data:text\/html):/i.test(t)) return "url_empty_or_invalid"

  if (t.startsWith("/uploads/") || t === "/uploads") return "uploads_path_not_served"
  if (t.startsWith("/static/") || t === "/static") return "static_path_not_served"

  if (t.startsWith("http://") || t.startsWith("https://")) {
    try {
      const u = new URL(t)
      const host = u.hostname.toLowerCase()
      if (host === "medusa" || host.endsWith(".internal")) return "wrong_path_prefix"
    } catch {
      return "url_empty_or_invalid"
    }
    return "unknown"
  }

  if (t.startsWith("/")) return "wrong_path_prefix"
  if (t.startsWith("data:image/")) return "unknown"

  return "wrong_path_prefix"
}
