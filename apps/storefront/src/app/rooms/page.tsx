import Link from "next/link"
import { RoomSetCard } from "@/components/room-set-card"
import { getRoomSets } from "@/lib/api/room-sets"

export default async function RoomsPage() {
  let data: { room_sets?: unknown[] } = {}
  try {
    data = await getRoomSets()
  } catch {
    return (
      <div data-state="error">
        <h1>Комнаты</h1>
        <p>Не удалось загрузить комнаты.</p>
        <p><Link href="/">На главную</Link></p>
      </div>
    )
  }
  const roomSets = data.room_sets ?? []
  const list = Array.isArray(roomSets) ? roomSets : []

  if (list.length === 0) {
    return (
      <div data-state="empty">
        <h1>Комнаты</h1>
        <p>Комплекты не найдены.</p>
        <p><Link href="/">На главную</Link></p>
      </div>
    )
  }

  return (
    <div data-state="success">
      <h1>Комнаты</h1>
      <ul style={{ listStyle: "none", display: "flex", flexWrap: "wrap", gap: "1rem" }}>
        {list.map((rs: { id?: string; slug?: string }) => (
          <li key={rs.id}>
            <RoomSetCard roomSet={rs} />
          </li>
        ))}
      </ul>
    </div>
  )
}
