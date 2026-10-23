import Link from "next/link"
import type { Metadata } from "next"
import { getRoomSets, getRoomSetStorefrontBySlug } from "@/lib/api/room-sets"
import { KIDS_ROOM_TYPE } from "@/lib/kids"
import { actions, roomsCopy, seo } from "@/lib/woodright-copy"
import { pageTitle } from "@/lib/page-title"
import { canonicalAlternates } from "@/lib/page-canonical"
import { getSiteUrl } from "@/lib/api/base"
import { EditorialPageJsonLd } from "@/components/editorial-page-json-ld"
import { roomDirectoryJsonLd } from "@/lib/editorial-page-json-ld"
import { roomEditorialScenes } from "@/lib/editorial-scenes"
import type { EditorialProduct } from "@/lib/editorial-scenes"
import { getEditorialProducts } from "@/lib/editorial-shopping-data"
import { RoomsEditorialLanding } from "@/components/rooms-editorial-landing"
import type { EditorialRoom } from "@/components/rooms-editorial-landing"

export const metadata: Metadata = {
  title: pageTitle(seo.rooms.title), description: seo.rooms.description,
  openGraph: { title: seo.rooms.title, description: seo.rooms.description, url: "/rooms" },
  ...canonicalAlternates("/rooms"),
}

function isPublishedAdultRoom(value: unknown): value is EditorialRoom & { is_active: true } {
  if (!value || typeof value !== "object") return false
  const room = value as Record<string, unknown>
  return room.is_active === true && room.room_type !== KIDS_ROOM_TYPE
    && typeof room.id === "string" && typeof room.title === "string" && !!room.title.trim()
    && typeof room.slug === "string" && /^[a-z0-9][a-z0-9-]{0,120}$/i.test(room.slug)
}

async function loadRoomShopping(rooms: EditorialRoom[]) {
  const memberships = await Promise.all(rooms.filter((room) => roomEditorialScenes[room.slug]).map(async (room) => {
    try {
      const data = await getRoomSetStorefrontBySlug(room.slug)
      const items: unknown[] = Array.isArray(data.room_set?.items) ? data.room_set.items : []
      const handles = new Set(items.flatMap((value) => {
        if (!value || typeof value !== "object") return []
        const product = (value as { product?: { handle?: unknown } }).product
        return typeof product?.handle === "string" ? [product.handle] : []
      }))
      return { slug: room.slug, handles: roomEditorialScenes[room.slug]!.spots.map((spot) => spot.handle).filter((handle) => handles.has(handle)) }
    } catch { return { slug: room.slug, handles: [] as string[] } }
  }))
  const products = await getEditorialProducts(memberships.flatMap((room) => room.handles))
  const result: Record<string, Record<string, EditorialProduct>> = {}
  for (const room of memberships) result[room.slug] = Object.fromEntries(room.handles.flatMap((handle) => products[handle] ? [[handle, products[handle]!]] : []))
  return result
}

export default async function RoomsPage() {
  let list: EditorialRoom[] = []
  try {
    const data = await getRoomSets()
    list = Array.isArray(data.room_sets) ? data.room_sets.filter(isPublishedAdultRoom) : []
  } catch { /* No archived room fallback when the API is unavailable. */ }
  if (!list.length) return <div data-state="empty">
    <h1>{roomsCopy.h1}</h1><div className="status-message"><p>{roomsCopy.emptyBody}</p>
      <div className="nav-links nav-links-center" style={{ marginTop: "1rem" }}><Link href="/">{actions.toHome}</Link></div>
    </div>
  </div>
  const productsByRoom = await loadRoomShopping(list)
  return <>
    <EditorialPageJsonLd payload={roomDirectoryJsonLd(getSiteUrl(), list, false, "Комнаты")} />
    <RoomsEditorialLanding rooms={list} productsByRoom={productsByRoom} />
  </>
}
