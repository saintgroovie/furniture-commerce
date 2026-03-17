import Link from "next/link"
import type { Metadata } from "next"
import { getSiteUrl } from "@/lib/api/base"
import { getRoomSetBySlug, NOT_FOUND } from "@/lib/api/room-sets"
import { RoomSetCta } from "@/components/room-set-cta"

function truncate(str: string, max: number): string {
  if (str.length <= max) return str
  return str.slice(0, max - 3).trim() + "..."
}

export async function generateMetadata({ params }: { params: { slug: string } }): Promise<Metadata> {
  const base = getSiteUrl()
  try {
    const data = await getRoomSetBySlug(params.slug)
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
    data = await getRoomSetBySlug(params.slug)
  } catch (e) {
    if (e instanceof Error && e.message === NOT_FOUND) {
      return (
        <div data-state="not_found" className="status-message">
          <h1>Комплект не найден</h1>
          <div className="nav-links nav-links-center" style={{ marginTop: "1rem" }}>
            <Link href="/rooms">К списку комнат</Link>
          </div>
        </div>
      )
    }
    return (
      <div data-state="error" className="status-message">
        <h1>Ошибка</h1>
        <p>Не удалось загрузить комплект.</p>
        <div className="nav-links nav-links-center" style={{ marginTop: "1rem" }}>
          <Link href="/rooms">К списку комнат</Link>
        </div>
      </div>
    )
  }
  const roomSet = data.room_set
  if (!roomSet) {
    return (
      <div data-state="not_found" className="status-message">
        <h1>Комплект не найден</h1>
        <div className="nav-links nav-links-center" style={{ marginTop: "1rem" }}>
          <Link href="/rooms">К списку комнат</Link>
        </div>
      </div>
    )
  }

  const items = (roomSet.items as Array<Record<string, unknown>>) ?? []
  const priceFrom = roomSet.price_from as number | null | undefined

  return (
    <div data-state="success">
      <h1>{(roomSet.title as string) ?? "Комната"}</h1>
      {roomSet.description && <p className="info-text" style={{ marginTop: "0.5rem" }}>{String(roomSet.description)}</p>}
      {priceFrom != null && (
        <p className="price" style={{ marginTop: "0.75rem", fontSize: "1.2rem" }}>
          от {priceFrom.toLocaleString("ru-RU")} ₽
        </p>
      )}

      {items.length > 0 && (
        <>
          <h2 style={{ marginTop: "1.5rem" }}>Состав комплекта</h2>
          <ul className="room-set-items">
            {items.map((item: Record<string, unknown>, i: number) => {
              const product = item.product as Record<string, unknown> | undefined
              const title = (product?.title as string) ?? "—"
              const qty = Number((item as { quantity?: number }).quantity ?? 1)
              const type = (product?.custom_product_type as Record<string, string> | undefined)?.product_type
              return (
                <li key={i} className="room-set-item">
                  <span>{title} × {qty}</span>
                  {type && <span className="badge">{type}</span>}
                </li>
              )
            })}
          </ul>
        </>
      )}

      <RoomSetCta roomSet={roomSet} />
    </div>
  )
}
