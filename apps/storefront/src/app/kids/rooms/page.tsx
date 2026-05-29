import Link from "next/link"
import type { Metadata } from "next"
import { RoomSetCard } from "@/components/room-set-card"
import { getRoomSets } from "@/lib/api/room-sets"
import { KIDS_ROOM_TYPE } from "@/lib/kids"

export const metadata: Metadata = {
  title: "Комнаты",
  description:
    "Готовые комплекты детской мебели Woodright. Комнаты для малышей и школьников.",
  openGraph: {
    title: "Детские комнаты | Woodright",
    description: "Готовые комплекты мебели для детских комнат.",
    url: "/kids/rooms",
  },
}

export default async function KidsRoomsPage() {
  let data: { room_sets?: unknown[] } = {}
  try {
    data = await getRoomSets()
  } catch {
    return (
      <div data-state="error">
        <h1>Детские комнаты</h1>
        <p className="info-text" style={{ marginTop: "0.5rem" }}>
          Не удалось загрузить комнаты.
        </p>
        <div className="nav-links" style={{ marginTop: "1rem" }}>
          <Link href="/kids">В детскую секцию</Link>
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
        <h1>Детские комнаты</h1>
        <div className="status-message">
          <p>Комплекты для детских комнат пока не добавлены.</p>
          <div
            className="nav-links nav-links-center"
            style={{ marginTop: "1rem" }}
          >
            <Link href="/kids">В детскую секцию</Link>
            <Link href="/rooms">Все комнаты</Link>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div data-state="success">
      <h1>Детские комнаты</h1>
      <p className="info-text" style={{ marginTop: "0.5rem" }}>
        Готовые комплекты мебели для детских комнат — от первых лет до школы.
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
