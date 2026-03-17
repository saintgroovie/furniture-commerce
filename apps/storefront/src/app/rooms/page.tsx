import Link from "next/link"
import type { Metadata } from "next"
import { RoomSetCard } from "@/components/room-set-card"
import { getRoomSets } from "@/lib/api/room-sets"

export const metadata: Metadata = {
  title: "Комнаты",
  description: "Готовые комплекты мебели Woodright по комнатам. Подбор мебели для гостиной, спальни, кабинета и др.",
  openGraph: {
    title: "Комнаты и готовые комплекты | Woodright",
    description: "Готовые комплекты мебели по комнатам.",
    url: "/rooms",
  },
}

export default async function RoomsPage() {
  let data: { room_sets?: unknown[] } = {}
  try {
    data = await getRoomSets()
  } catch {
    return (
      <div data-state="error">
        <h1>Комнаты</h1>
        <p className="info-text" style={{ marginTop: "0.5rem" }}>Не удалось загрузить комнаты.</p>
        <div className="nav-links" style={{ marginTop: "1rem" }}>
          <Link href="/">На главную</Link>
        </div>
      </div>
    )
  }
  const roomSets = data.room_sets ?? []
  const list = Array.isArray(roomSets) ? roomSets : []

  if (list.length === 0) {
    return (
      <div data-state="empty">
        <h1>Комнаты</h1>
        <div className="status-message">
          <p>Комплекты не найдены.</p>
          <div className="nav-links nav-links-center" style={{ marginTop: "1rem" }}>
            <Link href="/">На главную</Link>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div data-state="success">
      <h1>Комнаты</h1>
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
