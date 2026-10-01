import Link from "next/link"
import { FirstPriceFields } from "@/components/first-price-fields"
import { MediaUpload } from "@/components/media-upload"
import { ErrorBlock, PageHeader } from "@/components/page"
import { formatRub, priceLine } from "@/lib/format"
import { loadProduct } from "@/server/loaders"

export default async function ProductPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<{ saved?: string; error?: string; storefront?: string }>
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
      {query.saved === "1" && query.storefront === "miss" ? (
        <p className="toast warn" role="status">Данные сохранены<br />Витрина ещё не показывает эту цену</p>
      ) : null}
      {query.saved === "1" && query.storefront === "match" ? (
        <p className="toast" role="status">Сохранено. Витрина показывает ту же цену</p>
      ) : null}
      {query.saved === "1" && query.storefront === "skipped" ? (
        <p className="toast" role="status">Данные сохранены<br />Проверка витрины не запускалась</p>
      ) : null}
      {query.saved === "1" && !query.storefront ? <p className="toast" role="status">Сохранено</p> : null}
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
              variant.rub_price?.id ? (
                <form key={variant.id} action={`/api/catalog/${id}`} method="post" className="stack">
                  <input type="hidden" name="intent" value="price" />
                  <input type="hidden" name="variant_id" value={variant.id} />
                  <input type="hidden" name="expected_amount" value={variant.rub_price.amount} />
                  <p>{variant.sku || variant.title || "Вариант"} · было {formatRub(variant.rub_price.amount)}</p>
                  <label>Будет, ₽<input name="amount" inputMode="numeric" defaultValue={variant.rub_price.amount} /></label>
                  <label className="muted"><input type="checkbox" name="confirm" value="1" /> Подтверждаю сильное изменение</label>
                  <button className="primary" type="submit">Сохранить цену варианта</button>
                </form>
              ) : (
                <form key={variant.id} action={`/api/catalog/${id}`} method="post" className="stack">
                  <input type="hidden" name="intent" value="price" />
                  <input type="hidden" name="create" value="1" />
                  <input type="hidden" name="variant_id" value={variant.id} />
                  <p>{variant.sku || variant.title || "Вариант"}</p>
                  <p>Цена не задана</p>
                  <FirstPriceFields />
                  <button className="primary" type="submit">Задать цену</button>
                </form>
              )
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
            <MediaUpload productId={id} />
            {(product.images?.length ? product.images : []).map((image, index, list) => (
              <div key={image.id} className="media-frame">
                <img src={image.url} alt="" width={72} height={54} />
                <div className="stack">
                  <p>{image.url === product.thumbnail ? "Главный кадр" : "Дополнительный кадр"}</p>
                  <form action={`/api/catalog/${id}`} method="post">
                    <input type="hidden" name="intent" value="hero" />
                    <input type="hidden" name="thumbnail_url" value={image.url} />
                    <button className={image.url === product.thumbnail ? "ghost" : "primary"} type="submit">
                      {image.url === product.thumbnail ? "Уже главный кадр" : "Сделать главным"}
                    </button>
                  </form>
                  <form action={`/api/catalog/${id}`} method="post">
                    <input type="hidden" name="intent" value="reorder" />
                    <input type="hidden" name="url" value={image.url} />
                    <input type="hidden" name="direction" value="up" />
                    <input type="hidden" name="expected" value={list.map((item) => item.url).join("\n")} />
                    <button className="ghost" type="submit" disabled={index === 0}>Выше</button>
                  </form>
                  <form action={`/api/catalog/${id}`} method="post">
                    <input type="hidden" name="intent" value="reorder" />
                    <input type="hidden" name="url" value={image.url} />
                    <input type="hidden" name="direction" value="down" />
                    <input type="hidden" name="expected" value={list.map((item) => item.url).join("\n")} />
                    <button className="ghost" type="submit" disabled={index === list.length - 1}>Ниже</button>
                  </form>
                  <form action={`/api/catalog/${id}`} method="post">
                    <input type="hidden" name="intent" value="detach" />
                    <input type="hidden" name="url" value={image.url} />
                    <input type="hidden" name="expected" value={list.map((item) => item.url).join("\n")} />
                    <button className="ghost" type="submit">Убрать из товара</button>
                    <p className="muted">Файл не удаляется</p>
                  </form>
                </div>
              </div>
            ))}
            {!product.images?.length ? <p className="empty">Кадры не назначены. Неподтверждённый кандидат сам не публикуется</p> : null}
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
            <h2>Тип</h2>
            <p className="muted">Смена типа не публикует товар. Артикул и адрес страницы остаются</p>
            <ul>
              <li>Обычный и с вариантами можно положить в корзину</li>
              <li>По проекту корзина закрыта, остаётся заявка</li>
            </ul>
            {(["STANDARD", "CONFIGURABLE", "BESPOKE"] as const).map((type) => (
              <label key={type}>
                <input type="radio" name="classification" value={type} defaultChecked={product.classification === type} />
                {" "}
                {type === "STANDARD" ? "Обычный" : type === "CONFIGURABLE" ? "С вариантами" : "По проекту"}
              </label>
            ))}
            <label className="muted"><input type="checkbox" name="confirm" value="1" /> Подтверждаю смену типа</label>
            <button className="ghost" type="submit" name="intent" value="classification">Сохранить тип</button>
          </form>
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
