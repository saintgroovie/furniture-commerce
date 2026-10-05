import { PendingForm } from "@/components/pending-form"
import { Status } from "@/components/status"

export type GalleryImage = { id: string; url: string }

/**
 * Hero plus additional frames. Every button is a server-confirmed write
 * (hero / reorder / detach). The file itself is never deleted from here.
 */
export function MediaGallery({ productId, images, thumbnail }: { productId: string; images: GalleryImage[]; thumbnail: string | null }) {
  const action = `/api/catalog/${productId}`
  const expected = images.map((item) => item.url).join("\n")
  if (images.length === 0) {
    return (
      <div className="media-empty">
        <p>Главное изображение не добавлено</p>
        <p className="meta">Без него товар не готов к публикации. Загруженный файл сам не становится главным</p>
      </div>
    )
  }
  const hero = images.find((image) => image.url === thumbnail) ?? null
  return (
    <div className="gallery">
      <div className="gallery-hero">
        {hero ? <img src={hero.url} alt="Главный кадр" /> : <div className="empty">Главный кадр не выбран</div>}
        <span className="meta">{hero ? "Главный кадр" : "Выберите главный кадр из списка"}</span>
      </div>
      <ul className="gallery-frames" aria-label="Кадры товара">
        {images.map((image, index) => {
          const isHero = image.url === thumbnail
          return (
            <li key={image.id} className="gallery-frame">
              <img src={image.url} alt={isHero ? "Главный кадр" : `Кадр ${index + 1}`} />
              <div className="gallery-actions">
                {isHero ? (
                  <Status tone="positive">Главный</Status>
                ) : (
                  <PendingForm action={action}>
                    <input type="hidden" name="intent" value="hero" />
                    <input type="hidden" name="thumbnail_url" value={image.url} />
                    <button className="btn btn-secondary sm" type="submit">Сделать главным</button>
                  </PendingForm>
                )}
                <PendingForm action={action}>
                  <input type="hidden" name="intent" value="reorder" />
                  <input type="hidden" name="url" value={image.url} />
                  <input type="hidden" name="direction" value="up" />
                  <input type="hidden" name="expected" value={expected} />
                  <button className="btn btn-ghost sm" type="submit" disabled={index === 0} aria-label={`Кадр ${index + 1}: выше`}>↑</button>
                </PendingForm>
                <PendingForm action={action}>
                  <input type="hidden" name="intent" value="reorder" />
                  <input type="hidden" name="url" value={image.url} />
                  <input type="hidden" name="direction" value="down" />
                  <input type="hidden" name="expected" value={expected} />
                  <button className="btn btn-ghost sm" type="submit" disabled={index === images.length - 1} aria-label={`Кадр ${index + 1}: ниже`}>↓</button>
                </PendingForm>
                <PendingForm action={action}>
                  <input type="hidden" name="intent" value="detach" />
                  <input type="hidden" name="url" value={image.url} />
                  <input type="hidden" name="expected" value={expected} />
                  <button className="btn btn-ghost sm" type="submit" aria-label={`Кадр ${index + 1}: убрать из товара`}>Убрать</button>
                </PendingForm>
              </div>
            </li>
          )
        })}
      </ul>
    </div>
  )
}
