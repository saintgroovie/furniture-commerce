import Link from "next/link"
import { formatRub } from "@/lib/format"
import { formatRoomSetCardMeta } from "@/lib/room-set-card-meta"

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
  const meta = formatRoomSetCardMeta(roomSet)
  return (
    <Link href={`/rooms/${roomSet.slug}`} className="card card-link room-set-card">
      {roomSet.hero_image ? (
        <img
          src={roomSet.hero_image}
          alt={roomSet.title}
          className="card-img"
          loading="lazy"
        />
      ) : (
        <div className="card-img card-img-placeholder" aria-hidden="true" />
      )}
      <div className="card-body">
        <h3>{roomSet.title}</h3>
        {meta ? <span className="room-set-card-meta">{meta}</span> : null}
        {roomSet.price_from != null && (
          <p className="price">от {formatRub(roomSet.price_from)}</p>
        )}
      </div>
    </Link>
  )
}
