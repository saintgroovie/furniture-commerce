import Link from "next/link"
import type { EditorialProduct } from "@/lib/editorial-scenes"
import { roomEditorialScenes } from "@/lib/editorial-scenes"
import { RoomSetCard } from "./room-set-card"
import { EditorialArrow, EditorialShoppableImage } from "./editorial-shoppable-image"
import "./kids-rooms-editorial.css"

export type EditorialRoom = {
  id: string; slug: string; title: string; hero_image?: string
  room_type?: string; style?: string; price_from?: number
}

export function RoomsEditorialLanding({ rooms, productsByRoom }: {
  rooms: EditorialRoom[]
  productsByRoom: Record<string, Record<string, EditorialProduct>>
}) {
  const featured = rooms.find((room) => room.slug === "spalnya-cloud") ?? rooms.find((room) => roomEditorialScenes[room.slug])
  const curated = rooms.filter((room) => roomEditorialScenes[room.slug])
  const other = rooms.filter((room) => !roomEditorialScenes[room.slug])
  return (
    <div className="wr-editorial wr-editorial-rooms" data-editorial-version="kids-rooms-20261023">
      {featured ? (
        <section className="wr-editorial-hero wr-rooms-hero" aria-labelledby="wr-featured-room">
          <div className="wr-editorial-copy">
            <h1 className="wr-editorial-eyebrow">Комнаты</h1>
            <h2 id="wr-featured-room">{featured.title}</h2>
            <p className="wr-editorial-lead">Готовое сочетание мебели<br className="wr-desktop-break" /> для вашего дома.</p>
            <Link href={`/rooms/${featured.slug}`} className="btn wr-room-primary">Смотреть комнату <EditorialArrow /></Link>
          </div>
          <EditorialShoppableImage scene={roomEditorialScenes[featured.slug]!} products={productsByRoom[featured.slug] ?? {}} className="wr-rooms-hero-photo" priority />
        </section>
      ) : <h1 className="wr-editorial-directory-title wr-editorial-wrap">Комнаты</h1>}
      {curated.length > 0 && <>
        <p className="wr-editorial-hint wr-editorial-wrap">Выберите точку на фотографии, чтобы посмотреть товар</p>
        <section className="wr-room-entries wr-editorial-wrap" aria-label="Готовые комнаты">
          {curated.map((room) => <article className="wr-room-row" key={room.id}>
            <EditorialShoppableImage scene={roomEditorialScenes[room.slug]!} products={productsByRoom[room.slug] ?? {}} className="wr-room-row-photo" />
            <div className="wr-room-row-copy"><h2>{room.title}</h2>
              <Link href={`/rooms/${room.slug}`} className="wr-editorial-link">Смотреть комнату <EditorialArrow /></Link>
            </div>
          </article>)}
        </section>
      </>}
      {other.length > 0 && <section className="wr-room-other wr-editorial-wrap" aria-label="Другие комнаты">
        <ul className="product-grid">{other.map((room) => <li key={room.id}><RoomSetCard roomSet={room} /></li>)}</ul>
      </section>}
    </div>
  )
}
