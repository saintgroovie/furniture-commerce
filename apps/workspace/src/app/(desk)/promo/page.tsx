import { ErrorBlock, PageHeader } from "@/components/page"
import { loadPromo } from "@/server/loaders"

export default async function PromoPage({
  searchParams,
}: {
  searchParams: Promise<{ saved?: string; error?: string }>
}) {
  const query = await searchParams
  const result = await loadPromo()
  return (
    <>
      <PageHeader
        kicker="Акции"
        title="Акция в каталоге"
        lead="Слот выбирает, что показать. Цену покупателя задаёт прайс-лист, не слот"
      />
      {query.saved === "1" ? <p className="toast" role="status">Сохранено</p> : null}
      {query.error ? <p className="toast warn" role="alert">{query.error}</p> : null}
      {!result.ok ? <ErrorBlock message={result.message} /> : null}
      {result.ok ? (
        <div className="section-grid">
          <section className="card">
            <h2>Что показываем</h2>
            <p>{result.data.slot.enabled ? "Слот включён" : "Слот выключен"}</p>
            <p className="muted">{result.data.slot.label || "Подписи нет"}</p>
            <form action="/api/promo" method="post" className="stack">
              <button className="primary" name="enabled" value={result.data.slot.enabled ? "0" : "1"} type="submit">
                {result.data.slot.enabled ? "Выключить слот" : "Включить слот"}
              </button>
            </form>
            <ul>
              {result.data.products.map((product) => (
                <li key={product.product_id}>
                  <p>{product.title}{product.sku ? ` · ${product.sku}` : ""}</p>
                  <p className="muted">
                    {product.blocker === "no_sale_price"
                      ? "В слоте, но скидочной цены нет. Карточка не станет акционной"
                      : product.blocker === "unpublished"
                        ? "Черновик. Покупатель эту карточку не увидит"
                        : product.blocker === "no_image"
                          ? "Нет кадра, карточка акции не выйдет"
                          : product.blocker === "bespoke"
                            ? "Товар по проекту в эту карточку не ставится"
                            : product.blocker
                              ? "Слот не показывает эту карточку"
                              : product.sale_price != null
                                ? "Покупатель видит цену из прайс-листа"
                                : "Цена не изменилась от слота"}
                  </p>
                  <form action="/api/promo" method="post">
                    <input type="hidden" name="remove_product_id" value={product.product_id} />
                    <button className="ghost" type="submit">Убрать из слота</button>
                  </form>
                </li>
              ))}
            </ul>
            <form action="/api/promo" method="post" className="stack">
              <label>Добавить товар в слот<input name="add_product_id" placeholder="id товара" /></label>
              <button className="primary" type="submit">Поместить в слот</button>
              <p className="muted">Место в слоте не меняет обычную и акционную цену</p>
            </form>
          </section>
          <section className="card">
            <h2>Что платит покупатель</h2>
            <p className="muted">Прайс-лист: {result.data.price_list.title || "не найден"} · {result.data.price_list.active_now ? "сейчас действует" : "сейчас не действует"}</p>
            <p>Скидку задают в карточке товара, в поле акционной цены</p>
          </section>
        </div>
      ) : null}
    </>
  )
}
