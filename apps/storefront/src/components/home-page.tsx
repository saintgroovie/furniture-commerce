import Link from "next/link"
import { ProductCard } from "@/components/product-card"
import { RoomSetCard } from "@/components/room-set-card"

export type HomePreviewProduct = {
  id: string
  title: string
  description?: string
  handle?: string
  thumbnail?: string
  variants?: Array<{
    calculated_price?: { calculated_amount?: number }
    prices?: Array<{ amount?: number }>
  }>
  custom_product_type?: { product_type?: string }
}

export type HomePreviewRoomSet = {
  id: string
  title: string
  slug: string
  description?: string
  hero_image?: string
  room_type?: string
  style?: string
  price_from?: number
}

export type HomePreview = {
  products: HomePreviewProduct[]
  roomSets: HomePreviewRoomSet[]
  previewAvailable: boolean
}

type Props = {
  preview: HomePreview
}

const ENTRY_LINKS = [
  {
    href: "/catalog",
    label: "Каталог",
    description: "Готовые модели, варианты материалов и размеров",
    icon: "▦",
  },
  {
    href: "/rooms",
    label: "Комнаты",
    description: "Готовые комплекты мебели для целой комнаты",
    icon: "⌂",
  },
  {
    href: "/bespoke",
    label: "По проекту",
    description: "Заявка на расчёт — мебель под ваше помещение",
    icon: "✎",
  },
] as const

const TRUST_ITEMS = [
  "Мебель из массива и натуральных материалов",
  "Изготовление на заказ — без лишних обещаний на этапе каталога",
  "Детская и взрослая мебель в одной витрине",
] as const

export function HomePage({ preview }: Props) {
  return (
    <div className="home-page">
      <section className="hero home-hero">
        <div className="container">
          <p className="home-eyebrow">Woodright</p>
          <h1>Мебель на заказ — от каталога до готовой комнаты</h1>
          <p>
            Выберите готовую модель, соберите комплект по комнате или оставьте заявку на расчёт по
            проекту. Каталог и цены на сайте — для ориентира; финальные условия уточняет менеджер.
          </p>
          <div className="hero-actions">
            <Link href="/catalog" className="btn btn-primary">
              Смотреть каталог
            </Link>
            <Link href="/rooms" className="btn btn-secondary">
              Готовые комнаты
            </Link>
          </div>
        </div>
      </section>

      <section className="page-section">
        <div className="container home-section-inner">
          <header className="home-section-header">
            <h2>Куда дальше</h2>
            <p className="info-text">Три входа в витрину — без регистрации и лишних шагов на главной.</p>
          </header>
          <div className="cross-entry-tiles home-entry-tiles">
            {ENTRY_LINKS.map((item) => (
              <Link key={item.href} href={item.href} className="cross-entry-tile home-entry-tile">
                <span className="cross-entry-tile-icon" aria-hidden>
                  {item.icon}
                </span>
                <span className="home-entry-copy">
                  <span className="cross-entry-tile-label">{item.label}</span>
                  <span className="home-entry-desc">{item.description}</span>
                </span>
              </Link>
            ))}
          </div>
        </div>
      </section>

      {preview.previewAvailable ? (
        <section className="page-section home-preview-section">
          <div className="container home-section-inner">
            <header className="home-section-header">
              <h2>Из каталога и комнат</h2>
              <p className="info-text">Небольшая подборка с витрины — полные списки в разделах ниже.</p>
            </header>
            {preview.products.length > 0 && (
              <div className="home-preview-block">
                <div className="home-preview-head">
                  <h3>Товары</h3>
                  <Link href="/catalog" className="home-preview-link">
                    Весь каталог →
                  </Link>
                </div>
                <ul className="product-grid home-preview-grid">
                  {preview.products.map((p) => (
                    <li key={p.id}>
                      <ProductCard product={p} />
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {preview.roomSets.length > 0 && (
              <div className="home-preview-block">
                <div className="home-preview-head">
                  <h3>Комнаты</h3>
                  <Link href="/rooms" className="home-preview-link">
                    Все комплекты →
                  </Link>
                </div>
                <ul className="home-room-grid">
                  {preview.roomSets.map((rs) => (
                    <li key={rs.id}>
                      <RoomSetCard roomSet={rs} />
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        </section>
      ) : (
        <section className="page-section home-preview-fallback">
          <div className="container">
            <p className="info-text home-preview-fallback-text">
              Подборка с витрины временно недоступна — перейдите в{" "}
              <Link href="/catalog">каталог</Link> или <Link href="/rooms">комнаты</Link>.
            </p>
          </div>
        </section>
      )}

      <section className="home-trust">
        <div className="container">
          <ul className="home-trust-list">
            {TRUST_ITEMS.map((text) => (
              <li key={text}>{text}</li>
            ))}
          </ul>
        </div>
      </section>
    </div>
  )
}
