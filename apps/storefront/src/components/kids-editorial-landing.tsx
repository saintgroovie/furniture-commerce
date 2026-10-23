import Link from "next/link"
import type { EditorialProduct } from "@/lib/editorial-scenes"
import { kidsEditorialScenes } from "@/lib/editorial-scenes"
import { EditorialArrow, EditorialShoppableImage } from "./editorial-shoppable-image"
import "./kids-rooms-editorial.css"

export function KidsEditorialLanding({ products }: { products: Record<string, EditorialProduct> }) {
  return (
    <div className="wr-editorial wr-editorial-kids" data-editorial-version="kids-rooms-20261023">
      <section className="wr-editorial-hero wr-kids-hero" aria-labelledby="wr-kids-heading">
        <div className="wr-editorial-copy">
          <p className="wr-editorial-eyebrow">Woodright · Детская</p>
          <h1 id="wr-kids-heading">Детская для жизни<br />и фантазии</h1>
          <p className="wr-editorial-lead">Мебель из массива для сна, игр<br className="wr-desktop-break" /> и первых открытий.</p>
          <div className="wr-editorial-actions">
            <Link href="/kids/catalog" className="btn btn-primary">Смотреть детскую мебель <EditorialArrow /></Link>
            <Link href="#paintings" className="wr-editorial-link">Выбрать роспись <EditorialArrow /></Link>
          </div>
          <p className="wr-editorial-materials">Массив дерева · Ручная роспись · На долгие годы</p>
        </div>
        <EditorialShoppableImage scene={kidsEditorialScenes.playroom} products={products} className="wr-kids-hero-photo" priority />
      </section>

      <p className="wr-editorial-hint wr-editorial-wrap">Выберите точку на фотографии, чтобы посмотреть товар</p>
      <section className="wr-editorial-entries wr-editorial-wrap" aria-label="Мебель и росписи">
        <div className="wr-editorial-row">
          <EditorialShoppableImage scene={kidsEditorialScenes.nursery} products={products} className="wr-editorial-detail" />
          <Link href="/kids/catalog" className="wr-editorial-entry-link">Выбрать мебель <EditorialArrow /></Link>
        </div>
        <div className="wr-editorial-row is-reverse" id="paintings">
          <Link href="/kids/willie-winkie" className="wr-editorial-entry-link">Росписи Вилли Винки <EditorialArrow /></Link>
          <EditorialShoppableImage scene={kidsEditorialScenes.rural} products={products} className="wr-editorial-detail" />
        </div>
      </section>

      <section className="wr-editorial-craft wr-editorial-wrap" aria-labelledby="wr-craft-heading">
        <div>
          <p className="wr-editorial-eyebrow">Детали Oliver</p>
          <h2 id="wr-craft-heading">Ручная роспись</h2>
          <p className="wr-editorial-lead">От эскиза к рисунку на мебели.</p>
          <Link href="/kids/catalog" className="wr-editorial-link">Смотреть мебель <EditorialArrow /></Link>
        </div>
        <img src="/editorial/kids/oliver-hand-painting.webp" width={1672} height={941}
          alt="Художник расписывает мебель Oliver по бумажному эскизу" loading="lazy" decoding="async" />
      </section>
    </div>
  )
}
