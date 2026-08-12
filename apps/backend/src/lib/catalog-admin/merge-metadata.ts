/**
 * Merge-safe metadata helpers for admin mutations.
 * Never rebuild known schema and drop unknown sibling keys.
 */

export function asMetadataRecord(
  meta: unknown
): Record<string, unknown> {
  if (meta && typeof meta === "object" && !Array.isArray(meta)) {
    return { ...(meta as Record<string, unknown>) }
  }
  return {}
}

/**
 * Shallow merge: set/overwrite only provided keys; preserve all others.
 * Passing `undefined` for a key does not delete it.
 * Passing `null` sets null explicitly (caller intent).
 */
export function mergeProductMetadata(
  existing: unknown,
  patch: Record<string, unknown>
): Record<string, unknown> {
  const next = asMetadataRecord(existing)
  for (const [k, v] of Object.entries(patch)) {
    if (v === undefined) continue
    next[k] = v
  }
  return next
}

/**
 * Deep-merge one execution array element by key without dropping unknown fields
 * on that row. Non-object rows are preserved in place.
 */
export function mergeExecutionRowByKey(
  existing: unknown,
  rowKey: string,
  patch: Record<string, unknown>
): unknown[] {
  if (!Array.isArray(existing)) {
    throw new Error("execution axis is not an array — refusing mutation")
  }
  let found = false
  const out = existing.map((entry) => {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) return entry
    const row = entry as Record<string, unknown>
    const id =
      (typeof row.key === "string" && row.key) ||
      (typeof row.id === "string" && row.id) ||
      null
    if (id !== rowKey) return entry
    found = true
    return { ...row, ...patch }
  })
  if (!found) {
    throw new Error(`execution row key not found: ${rowKey}`)
  }
  return out
}
