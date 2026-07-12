import Link from "next/link"
import type { Metadata } from "next"
import { cache } from "react"
import { getSiteUrl } from "@/lib/api/base"
import { getRoomSetStorefrontBySlug, NOT_FOUND } from "@/lib/api/room-sets"
import { RoomSetCta } from "@/components/room-set-cta"
import { roomSetDetail } from "@/lib/woodright-copy"

function truncate(str: string, max: number): string {
  if (str.length <= max) return str
  return str.slice(0, max - 3).trim() + "..."
}

const loadRoomSet = cache(async (slug: string) => getRoomSetStorefrontBySlug(slug))

export async function generateMetadata({ params }: { params: { slug: string } }): Promise<Metadata> {
  const base = getSiteUrl()
  try {
    const data = await loadRoomSet(params.slug)
    const roomSet = data.room_set
    if (!roomSet) return { title: "Комплект", alternates: { canonical: `${base}/rooms/${params.slug}` } }
    const title = String(roomSet.title ?? "Комплект")
    const desc = roomSet.description ? truncate(String(roomSet.description), 160) : `Готовый комплект мебели: ${title}.`
    return {
      title,
      description: desc,
      openGraph: {
        title,
        description: desc,
        url: `/rooms/${params.slug}`,
      },
      alternates: { canonical: `${base}/rooms/${params.slug}` },
    }
  } catch {
    return { title: "Комплект", alternates: { canonical: `${base}/rooms/${params.slug}` } }
  }
}

export default async function RoomSetPage({ params }: { params: { slug: string } }) {
  let data: { room_set?: Record<string, unknown> } = {}
  try {
    data = await loadRoomSet(params.slug)
  } catch (e) {
    if (e instanceof Error && e.message === NOT_FOUND) {
      return (
        <div data-state="not_found">
          <p>{roomSetDetail.notFound}</p>
          <p><Link href="/rooms">К списку комнат</Link></p>
        </div>
      )
    }
    return (
      <div data-state="error">
        <p>{roomSetDetail.loadError}</p>
        <p><Link href="/rooms">К списку комнат</Link></p>
      </div>
    )
  }
  const roomSet = data.room_set
  if (!roomSet) {
    return (
      <div data-state="not_found">
        <p>{roomSetDetail.notFound}</p>
        <p><Link href="/rooms">К списку комнат</Link></p>
      </div>
    )
  }
  const items = (roomSet.items as unknown[]) ?? []
  return (
    <div data-state="success">
      <h1>{(roomSet.title as string) ?? "Комната"}</h1>
      <p>{String(roomSet.description ?? "")}</p>
      <p className="price">
        {roomSetDetail.priceFromLabel}: {roomSet.price_from != null ? String(roomSet.price_from) : roomSetDetail.priceUnknown}
      </p>
      <h2 style={{ marginTop: "1.5rem" }}>{roomSetDetail.compositionTitle}</h2>
      <ul>
        {items.map((item: Record<string, unknown>, i: number) => (
          <li key={i}>
            {String((item.product as Record<string, unknown>)?.title ?? "—")} × {Number((item as { quantity?: number }).quantity ?? 1)}
          </li>
        ))}
      </ul>
      <RoomSetCta roomSet={roomSet} />
    </div>
  )
}
