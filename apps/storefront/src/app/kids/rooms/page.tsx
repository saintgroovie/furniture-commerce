import Link from "next/link"
import type { Metadata } from "next"
import { RoomSetCard } from "@/components/room-set-card"
import { getRoomSets } from "@/lib/api/room-sets"
import { KIDS_ROOM_TYPE } from "@/lib/kids"
import { kidsRoomsCopy, seo } from "@/lib/woodright-copy"
import { CopyLines } from "@/components/copy-lines"

export const metadata: Metadata = {
  title: seo.kidsRooms.title,
  description: seo.kidsRooms.description,
  openGraph: {
    title: seo.kidsRooms.title,
    description: seo.kidsRooms.description,
    url: "/kids/rooms",
  },
}

export default async function KidsRoomsPage() {
  let data: { room_sets?: unknown[] } = {}
  try {
    data = await getRoomSets()
  } catch (err) {
    console.error("[kids/rooms] room sets load failed", err)
    return (
      <div data-state="empty">
        <h1>{kidsRoomsCopy.h1}</h1>
        <div className="status-message">
          <CopyLines lines={kidsRoomsCopy.emptyBody} />
          <div
            className="nav-links nav-links-center"
            style={{ marginTop: "1rem" }}
          >
            <Link href="/kids/catalog">Каталог детской мебели</Link>
            <Link href="/rooms">Все комнаты</Link>
          </div>
        </div>
      </div>
    )
  }

  const roomSets = data.room_sets ?? []
  const all = Array.isArray(roomSets) ? roomSets : []
  const list = all.filter(
    (rs: any) => rs.room_type === KIDS_ROOM_TYPE
  )

  if (list.length === 0) {
    return (
      <div data-state="empty">
        <h1>{kidsRoomsCopy.h1}</h1>
        <div className="status-message">
          <CopyLines lines={kidsRoomsCopy.emptyBody} />
          <div
            className="nav-links nav-links-center"
            style={{ marginTop: "1rem" }}
          >
            <Link href="/kids/catalog">Каталог детской мебели</Link>
            <Link href="/rooms">Все комнаты</Link>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div data-state="success">
      <h1>{kidsRoomsCopy.h1}</h1>
      <p className="info-text" style={{ marginTop: "0.5rem" }}>
        {kidsRoomsCopy.lead}
      </p>
      <ul className="product-grid" style={{ marginTop: "1.5rem" }}>
        {list.map((rs: { id?: string }) => (
          <li key={rs.id}>
            <RoomSetCard roomSet={rs as any} />
          </li>
        ))}
      </ul>
    </div>
  )
}
