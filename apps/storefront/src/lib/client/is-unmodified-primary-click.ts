/** True for unmodified primary (left) button clicks — intercept for client nav. */
export function isUnmodifiedPrimaryClick(e: {
  button?: number
  metaKey?: boolean
  ctrlKey?: boolean
  shiftKey?: boolean
  altKey?: boolean
}): boolean {
  if (e.button != null && e.button !== 0) return false
  if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return false
  return true
}
