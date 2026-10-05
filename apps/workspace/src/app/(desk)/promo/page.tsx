import Link from "next/link"
import { Thumb } from "@/components/object-row"
import { ConfirmAction } from "@/components/confirm-action"
import { Card, EmptyState, ErrorBlock, PageHeader } from "@/components/page"
import { PendingForm } from "@/components/pending-form"
import { ResultToast } from "@/components/result-toast"
import { Status } from "@/components/status"
import { formatRub } from "@/lib/format"
import { loadContacts, loadProducts, loadPromo } from "@/server/loaders"

const BLOCKER_TEXT: Record<string, string> = {
  no_sale_price: "Карточка показывается без скидки",
  unpublished: "Черновик. Покупатель эту карточку не увидит",
  no_image: "У товара нет главного изображения",
  bespoke: "Товар по проекту в карточку не ставится",
}

/**
 * «Витрина» = what the site shows right now. The slot picks products;
 * the buyer price comes from the price list and is edited in the product card.
 */
export default async function PromoPage({ searchParams }: { searchParams: Promise<{ saved?: string; error?: string }> }) {
  const query = await searchParams
  const [promo, products, contacts] = await Promise.all([loadPromo(), loadProducts(), loadContacts()])
  const inSlot = new Set(promo.ok ? promo.data.slot.product_ids : [])
  const candidates = products.ok ? products.data.products.filter((product) => !inSlot.has(product.id) && product.classification !== "BESPOKE") : []
  return (
    <>
      <PageHeader kicker="Витрина" title="Витрина" lead="Что покупатель видит на сайте сейчас. Место в карточке и цена покупателя - разные вещи" />
      <ResultToast saved={query.saved} error={query.error} />
      {!promo.ok ? <ErrorBlock message={promo.message} /> : null}
      {promo.ok ? (
        <div className="workspace">
          <div className="stack-lg">
            <Card
              title="Показываем на витрине"
              trailing={
                <PendingForm action="/api/promo">
                  <button className="btn btn-secondary sm" name="enabled" value={promo.data.slot.enabled ? "0" : "1"} type="submit">
                    {promo.data.slot.enabled ? "Выключить карточку" : "Включить карточку"}
                  </button>
                </PendingForm>
              }
            >
              <div className="row">
                <Status tone={promo.data.slot.enabled ? "positive" : "neutral"} size="lg">{promo.data.slot.enabled ? "Карточка включена" : "Карточка выключена"}</Status>
                <span className="meta">{promo.data.slot.label || "подписи нет"}</span>
              </div>
              {promo.data.products.length === 0 ? <EmptyState title="В карточке нет товаров" hint="Добавьте товар ниже. Цена от этого не изменится" /> : null}
              <div className="list">
                {promo.data.products.map((product) => (
                  <div key={product.product_id} className="object-row">
                    {product.thumbnail && product.blocker !== "no_image" ? <Thumb src={product.thumbnail} size="stage" /> : (
                      <div className="media-empty">
                        <p>У товара нет главного изображения</p>
                        <Link href={`/catalog/${product.product_id}#media`}>Открыть товар</Link>
                        <p className="meta">Покупатель эту карточку не увидит, пока нет кадра</p>
                      </div>
                    )}
                    <div className="object-row-main">
                      <Link href={`/catalog/${product.product_id}`} className="object-row-title" style={{ textDecoration: "none" }}>
                        {product.title}
                      </Link>
                      <span className="object-row-meta">
                        {product.sku || "SKU нет"} · обычная {product.base_price != null ? formatRub(product.base_price) : "не задана"} · покупатель видит{" "}
                        {product.buyer_sale_price != null ? `${formatRub(product.buyer_sale_price)} (−${product.discount_percent ?? 0}%)` : product.buyer_base_price != null ? formatRub(product.buyer_base_price) : "цену не видит"}
                      </span>
                      {product.blocker ? <Status tone={product.blocker === "no_sale_price" ? "neutral" : "attention"}>{BLOCKER_TEXT[product.blocker] ?? "Слот не показывает эту карточку"}</Status> : <Status tone="positive">Покупатель видит карточку</Status>}
                      {!product.blocker && product.buyer_sale_price == null && product.buyer_base_price != null ? <span className="meta">Карточка показывается без скидки</span> : null}
                    </div>
                    <div className="object-row-end">
                      <ConfirmAction
                        action="/api/promo"
                        fields={{ remove_product_id: product.product_id }}
                        trigger="Убрать"
                        triggerClassName="btn btn-ghost sm"
                        title="Убрать товар из карточки на витрине?"
                        text={`${product.title} исчезнет из карточки. Обычная и акционная цены не изменятся`}
                        confirmLabel="Убрать из карточки"
                      />
                    </div>
                  </div>
                ))}
              </div>
              <PendingForm action="/api/promo" className="field-row">
                <label className="field" style={{ flex: 1 }}>
                  <span>Добавить товар</span>
                  <select name="add_product_id" defaultValue="" required>
                    <option value="" disabled>Выберите товар</option>
                    {candidates.map((product) => (
                      <option key={product.id} value={product.id}>
                        {product.title} · {product.skus[0] || product.id}{product.status !== "published" ? " · черновик" : ""}
                      </option>
                    ))}
                  </select>
                </label>
                <button className="btn btn-secondary" type="submit" disabled={candidates.length === 0}>Поместить в карточку</button>
              </PendingForm>
              <p className="meta">Место в карточке не меняет ни обычную, ни акционную цену</p>
            </Card>
          </div>
          <aside className="stack-lg context">
            <Card title="Цена покупателя">
              <Status tone={promo.data.price_list.active_now ? "positive" : "waiting"} size="lg">
                {promo.data.price_list.active_now ? "Прайс-лист действует" : "Прайс-лист сейчас не действует"}
              </Status>
              <p className="meta">{promo.data.price_list.title || "Прайс-лист не найден"}</p>
              <p>Скидка задаётся в карточке товара, в поле акционной цены. Здесь она только показывается</p>
              <Link className="btn btn-ghost sm" href="/catalog">Открыть товары</Link>
            </Card>
            <Card title="Контакты на сайте">
              {contacts.ok && contacts.data.contacts ? (
                <ul className="checklist">
                  <li><span className="meta">Бесплатный звонок</span> {contacts.data.contacts.free_call.display}</li>
                  <li><span className="meta">Написать или позвонить</span> {contacts.data.contacts.write_or_call.display}</li>
                  <li><Status tone={contacts.data.live ? "positive" : "waiting"}>{contacts.data.live ? "Опубликованы" : "Черновик"}</Status></li>
                </ul>
              ) : (
                <p className="meta">{(contacts.ok ? contacts.data.message : contacts.message) || "Контакты на сайте ещё не настроены"}</p>
              )}
            </Card>
          </aside>
        </div>
      ) : null}
    </>
  )
}
