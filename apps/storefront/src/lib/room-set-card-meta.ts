/**
 * Buyer-facing RoomSet index card meta (`room_type · identity`).
 *
 * V1 owner-approved rooms store collection style `Greenwich` on BOTH
 * `spalnya-greenwich` and `spalnya-cloud` in the immutable RoomSet manifest.
 * The card chip must show the room identity (Greenwich / Cloud), not the
 * shared collection style — and must never derive identity from linked
 * products or SKUs.
 */

export const ROOMSET_CARD_IDENTITY_BY_SLUG: Readonly<Record<string, string>> = {
  "spalnya-greenwich": "Greenwich",
  "spalnya-cloud": "Cloud",
}

export type RoomSetCardMetaInput = {
  slug?: string | null
  room_type?: string | null
  style?: string | null
}

/** Presentation identity for the card chip (not product collection). */
export function resolveRoomSetCardIdentityLabel(
  roomSet: Pick<RoomSetCardMetaInput, "slug" | "style">
): string | null {
  const slug = typeof roomSet.slug === "string" ? roomSet.slug.trim() : ""
  if (slug && Object.prototype.hasOwnProperty.call(ROOMSET_CARD_IDENTITY_BY_SLUG, slug)) {
    return ROOMSET_CARD_IDENTITY_BY_SLUG[slug] ?? null
  }
  const style = typeof roomSet.style === "string" ? roomSet.style.trim() : ""
  return style || null
}

/** Full meta string for `.room-set-card-meta`, or null when empty. */
export function formatRoomSetCardMeta(roomSet: RoomSetCardMetaInput): string | null {
  const roomType =
    typeof roomSet.room_type === "string" ? roomSet.room_type.trim() : ""
  const identity = resolveRoomSetCardIdentityLabel(roomSet)
  const parts = [roomType, identity].filter(Boolean)
  return parts.length > 0 ? parts.join(" · ") : null
}
