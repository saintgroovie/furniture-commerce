import Link from "next/link"
import type { Metadata } from "next"
import { RoomSetCard } from "@/components/room-set-card"
import { getRoomSets } from "@/lib/api/room-sets"
import { KIDS_ROOM_TYPE } from "@/lib/kids"
import { actions, roomsCopy, seo } from "@/lib/woodright-copy"

export const metadata: Metadata = {
  title: seo.rooms.title,
  description: seo.rooms.description,
  openGraph: {
    title: seo.rooms.title,
    description: seo.rooms.description,
    url: "/rooms",
  },
}

export default async function RoomsPage() {
  let data: { room_sets?: unknown[] } = {}
  try {
    data = await getRoomSets()
  } catch (err) {
    console.error("[rooms] room sets load failed", err)
    return (
      <div data-state="empty">
        <h1>{roomsCopy.h1}</h1>
        <div className="status-message">
          <p>{roomsCopy.emptyBody}</p>
          <div className="nav-links nav-links-center" style={{ marginTop: "1rem" }}>
            <Link href="/">{actions.toHome}</Link>
          </div>
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
        <h2 className="cross-entry-heading">{roomsCopy.kidsEntryTitle}</h2>
        <p className="cross-entry-text">
          {roomsCopy.kidsEntryText}
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
        <h1>{roomsCopy.h1}</h1>
        <div className="status-message">
          <p>{roomsCopy.emptyBody}</p>
          <div className="nav-links nav-links-center" style={{ marginTop: "1rem" }}>
            <Link href="/">{actions.toHome}</Link>
          </div>
        </div>
        {kidsEntry}
      </div>
    )
  }

  return (
    <div data-state="success">
      <h1>{roomsCopy.h1}</h1>
      <p className="info-text" style={{ marginTop: "0.5rem" }}>{roomsCopy.lead}</p>
      <p className="page-caption">{roomsCopy.supporting}</p>
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
