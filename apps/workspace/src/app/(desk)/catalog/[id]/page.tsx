import Link from "next/link"
import { ErrorBlock, PageHeader } from "@/components/page"
import { formatRub, priceLine } from "@/lib/format"
import { loadProduct } from "@/server/loaders"

export default async function ProductPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<{ saved?: string; error?: string }>
}) {
  const { id } = await params
  const query = await searchParams
  const result = await loadProduct(id)
  if (!result.ok) return <><PageHeader title="Товар" /><ErrorBlock message={result.message} /></>
  const product = result.data.product
  const blockers = product.publish?.blockers ?? []
  const bespoke = product.classification === "BESPOKE"
  const height = product.dimensions?.height_mm ? product.dimensions.height_mm / 10 : ""
  const width = product.dimensions?.width_mm ? product.dimensions.width_mm / 10 : ""
  const depth = product.dimensions?.depth_mm ? product.dimensions.depth_mm / 10 : ""
  return (
    <>
      <PageHeader kicker="Товар" title={product.title} lead={bespoke ? "По проекту, в корзину не кладётся" : product.subtitle || product.collection_label || ""} />
      {query.saved === "1" ? <p className="toast" role="status">Сохранено</p> : null}
      {query.error ? <p className="toast warn" role="alert">{query.error}</p> : null}
      <div className="section-grid">
        <div className="stack">
          <section className="card">
            <h2>Основное</h2>
            <p className="muted">Артикул: {product.skus?.join(", ") || "не указан"}. Адрес страницы не меняется отсюда</p>
            <form action={`/api/catalog/${id}`} method="post" className="stack">
              <input type="hidden" name="intent" value="profile" />
              <label>Название<input name="title" defaultValue={product.title} required /></label>
              <label>Подзаголовок<input name="subtitle" defaultValue={product.subtitle || ""} /></label>
              <label>Описание<textarea name="description" rows={4} defaultValue={product.description || ""} /></label>
              <button className="primary" type="submit">Сохранить текст</button>
            </form>
          </section>
          <section className="card">
            <h2>Размеры</h2>
            <p className="muted">Высота, ширина, глубина, в сантиметрах</p>
            <form action={`/api/catalog/${id}`} method="post" className="stack">
              <input type="hidden" name="intent" value="dimensions" />
              <label>Высота, см<input name="height_cm" inputMode="decimal" defaultValue={height} /></label>
              <label>Ширина, см<input name="width_cm" inputMode="decimal" defaultValue={width} /></label>
              <label>Глубина, см<input name="depth_cm" inputMode="decimal" defaultValue={depth} /></label>
              <button className="primary" type="submit">Сохранить размеры</button>
            </form>
          </section>
          <section className="card" id="price">
            <h2>Цена</h2>
            {bespoke ? <p>У товара по проекту нет цены в корзине</p> : null}
            {!bespoke ? <p>{priceLine(product.price_display)}. Обычная цена и акция в прайс-листе - разные поля</p> : null}
            {!bespoke ? product.variants.map((variant) => (
              <form key={variant.id} action={`/api/catalog/${id}`} method="post" className="stack">
                <input type="hidden" name="intent" value="price" />
                <input type="hidden" name="variant_id" value={variant.id} />
                <input type="hidden" name="expected_amount" value={variant.rub_price?.amount ?? ""} />
                <p>{variant.sku || variant.title || "Вариант"} · было {formatRub(variant.rub_price?.amount)}</p>
                <label>Будет, ₽<input name="amount" inputMode="numeric" defaultValue={variant.rub_price?.amount ?? ""} /></label>
                <label className="muted"><input type="checkbox" name="confirm" value="1" /> Подтверждаю сильное изменение</label>
                <button className="primary" type="submit">Сохранить цену варианта</button>
              </form>
            )) : null}
            {!bespoke ? product.variants.map((variant) => (
              <form key={`${variant.id}-promo`} action={`/api/catalog/${id}`} method="post" className="stack">
                <input type="hidden" name="intent" value="promo" />
                <input type="hidden" name="variant_id" value={variant.id} />
                <label>Акционная цена, меньше обычной<input name="amount" inputMode="numeric" /></label>
                <button className="ghost" type="submit">Записать в прайс-лист</button>
                <button className="ghost" type="submit" name="remove" value="1">Убрать акционную цену</button>
              </form>
            )) : null}
          </section>
          <section className="card" id="media">
            <h2>Медиа</h2>
            <p>{product.thumbnail ? "Главный кадр выбран" : "Нет главного кадра"}</p>
            {product.image_urls?.length ? product.image_urls.map((url) => (
              <form key={url} action={`/api/catalog/${id}`} method="post" className="stack">
                <input type="hidden" name="intent" value="hero" />
                <input type="hidden" name="thumbnail_url" value={url} />
                <p className="muted">{url}</p>
                <button className={url === product.thumbnail ? "ghost" : "primary"} type="submit">
                  {url === product.thumbnail ? "Уже главный кадр" : "Сделать главным"}
                </button>
              </form>
            )) : <p className="empty">Кадры не назначены. Неподтверждённый кандидат сам не публикуется</p>}
          </section>
        </div>
        <aside className="card" id="publish">
          <h2>Публикация</h2>
          <div className="pills">
            <span className="pill">{product.classification}</span>
            {product.kids_nav ? <span className="pill">Детская витрина</span> : null}
            <span className="pill">{product.status === "published" ? "Опубликован" : "Черновик"}</span>
          </div>
          <p>{product.readiness.visible ? "Покупатель видит" : "На витрине не виден"}</p>
          {blockers.length ? (
            <ul>
              {blockers.map((blocker) => <li key={blocker.code}>{blocker.message}</li>)}
            </ul>
          ) : <p className="pill ok">Блокеров публикации нет</p>}
          <form action={`/api/catalog/${id}`} method="post" className="stack">
            <button className="primary" type="submit" name="intent" value="publish">Опубликовать</button>
            <button className="ghost" type="submit" name="intent" value="unpublish">Снять с витрины</button>
            <p className="muted">Снятие с витрины не удаляет товар. Покупатель перестанет его видеть</p>
          </form>
          <Link href="/catalog">К каталогу</Link>
        </aside>
      </div>
    </>
  )
}
