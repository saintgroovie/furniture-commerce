import { ObjectRow } from "@/components/object-row"
import { Card, EmptyState, ErrorBlock, ModeTabs, PageHeader } from "@/components/page"
import { StateBadge } from "@/components/status"
import { CATALOG_MODES } from "@/lib/nav"
import { loadRooms } from "@/server/loaders"

/** Rooms live inside «Товары» as a mode. RoomSet stays its own entity (read-only here). */
export default async function RoomsPage() {
  const result = await loadRooms()
  return (
    <>
      <PageHeader kicker="Каталог" title="Комнаты" lead="Набор - отдельная сущность, не товар. Состав и порядок меняются в технической админке" right={<ModeTabs items={CATALOG_MODES} active="rooms" />} />
      {!result.ok ? <ErrorBlock message={result.message} /> : null}
      {result.ok ? (
        <div className="card list">
          {result.data.room_sets.length === 0 ? <EmptyState title="Наборов нет" /> : null}
          {result.data.room_sets.map((room) => (
            <ObjectRow
              key={room.id}
              title={room.title}
              meta={[room.slug, room.room_type || "тип комнаты не указан"].join(" · ")}
              end={<StateBadge state={room.is_active === false ? { tone: "neutral", label: "Скрыт" } : { tone: "positive", label: "На витрине" }} />}
            />
          ))}
        </div>
      ) : null}
    </>
  )
}
