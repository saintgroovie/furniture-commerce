import Link from "next/link"

type RoomSet = {
  id: string
  title: string
  slug: string
  description?: string
  hero_image?: string
  room_type?: string
  style?: string
  price_from?: number
}

export function RoomSetCard({ roomSet }: { roomSet: RoomSet }) {
  return (
    <div className="card">
      {roomSet.hero_image && (
        <img
          src={roomSet.hero_image}
          alt={roomSet.title}
          className="card-img"
        />
      )}
      <div className="card-body">
        <h3>
          <Link href={`/rooms/${roomSet.slug}`}>{roomSet.title}</Link>
        </h3>
        {(roomSet.room_type || roomSet.style) && (
          <div style={{ fontSize: "0.8rem", color: "var(--color-fg-muted)", marginTop: "0.25rem" }}>
            {[roomSet.room_type, roomSet.style].filter(Boolean).join(" · ")}
          </div>
        )}
        {roomSet.description && (
          <p className="info-text" style={{ marginTop: "0.5rem" }}>
            {roomSet.description.length > 100
              ? roomSet.description.slice(0, 100).trim() + "…"
              : roomSet.description}
          </p>
        )}
        {roomSet.price_from != null && (
          <p className="price" style={{ marginTop: "0.5rem" }}>
            от {roomSet.price_from.toLocaleString("ru-RU")} ₽
          </p>
        )}
      </div>
    </div>
  )
}
