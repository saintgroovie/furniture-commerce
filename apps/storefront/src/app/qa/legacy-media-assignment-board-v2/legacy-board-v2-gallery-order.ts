/**
 * Shared gallery reorder helper — single source of truth for array moves.
 * Used by LegacyMediaBoardV2Client and validated by GalleryStrip + FinalMediaOrderBlock.
 */
export function reorderGalleryIds(
  gallery: string[],
  fromIdx: number,
  toIdx: number
): string[] | null {
  if (fromIdx === toIdx) return null
  if (fromIdx < 0 || fromIdx >= gallery.length) return null
  if (toIdx < 0 || toIdx >= gallery.length) return null
  const next = [...gallery]
  const [item] = next.splice(fromIdx, 1)
  if (item === undefined) return null
  next.splice(toIdx, 0, item)
  return next
}
