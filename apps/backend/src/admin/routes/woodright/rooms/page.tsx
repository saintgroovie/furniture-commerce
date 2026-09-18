import { Container, Text } from "@medusajs/ui"
import { DeskFrame } from "../../../components/woodright/DeskNav"
import { useDeskExtras } from "../../../lib/use-desk-extras"

const WoodrightRoomsPage = () => {
  const extras = useDeskExtras()
  return (
    <Container className="divide-y p-0">
      <DeskFrame
        title="Комнаты"
        lead="Набор - отдельная сущность, не товар"
        active="rooms"
      >
        {extras.loading ? (
          <div className="px-6 py-4">
            <Text size="small" className="text-ui-fg-subtle">
              Загружаем наборы…
            </Text>
          </div>
        ) : null}
        {extras.error ? (
          <div className="px-6 py-4">
            <Text size="small" className="text-ui-fg-error">
              {extras.error}
            </Text>
          </div>
        ) : null}
        <div className="grid md:grid-cols-3 gap-3 px-6 py-4">
          {extras.rooms.length === 0 && !extras.loading && !extras.error ? (
            <Text size="small" className="text-ui-fg-subtle">
              Наборов комнат пока нет
            </Text>
          ) : (
            extras.rooms.map((room) => (
              <article
                key={room.id}
                className="rounded-md border border-ui-border-base px-3 py-3"
              >
                <Text weight="plus">{room.title}</Text>
                <Text size="small" className="text-ui-fg-subtle mt-1">
                  {room.room_type || room.slug}
                  {room.is_active === false ? " · скрыт" : " · на сайте"}
                </Text>
              </article>
            ))
          )}
        </div>
      </DeskFrame>
    </Container>
  )
}

export default WoodrightRoomsPage
