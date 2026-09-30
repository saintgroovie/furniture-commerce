import { ErrorBlock, PageHeader } from "@/components/page"
import { loadRooms } from "@/server/loaders"

export default async function RoomsPage() {
  const result = await loadRooms()
  return (
    <>
      <PageHeader kicker="Комнаты" title="Комнаты" lead="Набор - отдельная сущность, не товар" />
      {!result.ok ? <ErrorBlock message={result.message} /> : null}
      {result.ok ? (
        <div className="stack">
          {result.data.room_sets.length === 0 ? <p className="empty">Наборов нет</p> : null}
          {result.data.room_sets.map((room) => (
            <article key={room.id} className="row-card">
              <div>
                <h2>{room.title}</h2>
                <span className="muted">{room.slug}</span>
              </div>
              <span className="pill">{room.room_type || "Тип комнаты не указан"}</span>
              <span className={room.is_active === false ? "pill warn" : "pill ok"}>{room.is_active === false ? "Скрыт" : "На витрине"}</span>
            </article>
          ))}
        </div>
      ) : null}
    </>
  )
}
