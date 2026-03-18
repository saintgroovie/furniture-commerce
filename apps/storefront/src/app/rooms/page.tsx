import Link from "next/link"
import type { Metadata } from "next"
import { RoomSetCard } from "@/components/room-set-card"
import { getRoomSets } from "@/lib/api/room-sets"
import { KIDS_ROOM_TYPE } from "@/lib/kids"

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
  const all = Array.isArray(roomSets) ? roomSets : []
  const list = all.filter((rs: any) => rs.room_type !== KIDS_ROOM_TYPE)

  const kidsEntry = (
    <section className="cross-entry-block cross-entry-kids">
      <div className="cross-entry-header">
        <h2 className="cross-entry-heading">Детские комнаты</h2>
        <p className="cross-entry-text">
          Готовые решения для детской — безопасные материалы, продуманная эргономика и дизайн, который растёт вместе с ребёнком.
        </p>
      </div>
      <div className="cross-entry-tiles">
        <div className="cross-entry-tile">
          <span className="cross-entry-tile-icon" aria-hidden="true">◈</span>
          <span className="cross-entry-tile-label">Безопасные материалы</span>
        </div>
        <div className="cross-entry-tile">
          <span className="cross-entry-tile-icon" aria-hidden="true">◇</span>
          <span className="cross-entry-tile-label">Продуманная эргономика</span>
        </div>
        <div className="cross-entry-tile">
          <span className="cross-entry-tile-icon" aria-hidden="true">○</span>
          <span className="cross-entry-tile-label">Растёт с ребёнком</span>
        </div>
      </div>
      <Link href="/kids/rooms" className="btn cross-entry-btn">В раздел детской →</Link>
    </section>
  )

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
        {kidsEntry}
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
      {kidsEntry}
    </div>
  )
}
