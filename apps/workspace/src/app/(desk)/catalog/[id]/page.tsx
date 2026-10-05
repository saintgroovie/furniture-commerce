import Link from "next/link"
import { ConfirmAction } from "@/components/confirm-action"
import { ConflictPanel } from "@/components/conflict-panel"
import { MediaGallery } from "@/components/media-gallery"
import { MediaUpload } from "@/components/media-upload"
import { Thumb } from "@/components/object-row"
import { Card, ErrorBlock, ObjectHeader } from "@/components/page"
import { PendingForm } from "@/components/pending-form"
import { PriceEditor } from "@/components/price-editor"
import { ReadinessChecklist } from "@/components/readiness-checklist"
import { ResultToast } from "@/components/result-toast"
import { SidePanel } from "@/components/side-panel"
import { StateBadge, Status } from "@/components/status"
import { formatRub } from "@/lib/format"
import { parsePriceConflict } from "@/lib/price-presentation"
import { classificationLabel, primaryProductAction, publicationState, readinessChecklist, readinessSummary, toCm } from "@/lib/product-presentation"
import { loadProduct } from "@/server/loaders"

const SECTIONS = [
  ["#profile", "Основное"],
  ["#dimensions", "Размеры"],
  ["#media", "Медиа"],
  ["#price", "Цена"],
  ["#state", "Состояние"],
] as const

export default async function ProductPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<Record<string, string | undefined>>
}) {
  const { id } = await params
  const query = await searchParams
  const result = await loadProduct(id)
  if (!result.ok) return <><ObjectHeader back="Каталог" backHref="/catalog" title="Товар" /><ErrorBlock message={result.message} /></>
  const product = result.data.product
  const siteUrl = (result.data as { site_url?: string | null }).site_url ?? null
  const promoAvailable = (result.data as { promo_price_available?: boolean }).promo_price_available !== false
  const bespoke = product.classification === "BESPOKE"
  const published = product.status === "published"
  const checklist = readinessChecklist(product)
  const summary = readinessSummary(checklist)
  const primary = primaryProductAction(product)
  const publication = publicationState(product)
  const conflict = parsePriceConflict(query)
  const needsConfirm = query.confirm === "needed"
  const siteHref = siteUrl ? `${siteUrl.replace(/\/$/, "")}/product/${encodeURIComponent(product.id)}` : null
  const classificationSafe = !published

  return (
    <>
      <ObjectHeader
        back="Каталог"
        backHref="/catalog"
        title={<span className="row"><Thumb src={product.thumbnail} />{product.title}</span>}
        meta={[product.skus?.join(", ") || "SKU нет", classificationLabel(product.classification), product.collection_label || null, product.kids_nav ? "детская навигация" : null].filter(Boolean).join(" · ")}
        states={
          <>
            <StateBadge size="lg" state={publication} />
            <Status tone={summary.done === summary.total ? "positive" : "attention"} size="lg">
              Готовность {summary.done} из {summary.total}
            </Status>
          </>
        }
        next={primary.kind === "published" ? "товар на витрине, дальше следим за ценой и фото" : primary.kind === "blocked" ? primary.reason : primary.label.toLowerCase()}
        primary={
          primary.kind === "publish" ? (
            <PendingForm action={`/api/catalog/${id}`}>
              <input type="hidden" name="intent" value="publish" />
              <button className="btn btn-primary" type="submit">Опубликовать</button>
            </PendingForm>
          ) : primary.kind === "published" ? (
            siteHref ? <a className="btn btn-primary" href={siteHref} target="_blank" rel="noreferrer">Посмотреть на сайте</a> : null
          ) : (
            <a className="btn btn-primary" href={primary.anchor}>{primary.label}</a>
          )
        }
        secondary={
          <>
            {published ? (
              <ConfirmAction
                action={`/api/catalog/${id}`}
                fields={{ intent: "unpublish" }}
                trigger="Снять с витрины"
                title="Снять товар с витрины?"
                text="Покупатель перестанет видеть товар. Карточка, цены и фото сохранятся, вернуть можно будет кнопкой «Опубликовать»"
                confirmLabel="Снять с витрины"
              />
            ) : null}
            {!published && siteHref && product.readiness.visible ? <a className="btn btn-ghost" href={siteHref} target="_blank" rel="noreferrer">Посмотреть на сайте</a> : null}
          </>
        }
      />
      <ResultToast saved={query.saved} error={conflict ? undefined : query.error} storefront={query.storefront} />
      <nav className="section-nav" aria-label="Разделы товара">
        {SECTIONS.map(([href, label]) => (
          <a key={href} href={href}>{label}</a>
        ))}
      </nav>
      <div className="workspace">
        <div className="stack-lg">
          <Card id="profile" title="Основное" trailing={<span className="meta">адрес страницы не меняется</span>}>
            <PendingForm action={`/api/catalog/${id}`} className="stack">
              <input type="hidden" name="intent" value="profile" />
              <label className="field"><span>Название</span><input name="title" defaultValue={product.title} required /></label>
              <label className="field"><span>Подзаголовок</span><input name="subtitle" defaultValue={product.subtitle || ""} /></label>
              <label className="field"><span>Описание</span><textarea name="description" rows={4} defaultValue={product.description || ""} /></label>
              <button className="btn btn-secondary" type="submit">Сохранить текст</button>
            </PendingForm>
          </Card>
          <Card id="dimensions" title="Размеры" trailing={<span className="meta">в сантиметрах</span>}>
            <PendingForm action={`/api/catalog/${id}`} className="stack">
              <input type="hidden" name="intent" value="dimensions" />
              <div className="field-row">
                <label className="field"><span>Высота, см</span><input name="height_cm" inputMode="decimal" defaultValue={toCm(product.dimensions?.height_mm)} /></label>
                <label className="field"><span>Ширина, см</span><input name="width_cm" inputMode="decimal" defaultValue={toCm(product.dimensions?.width_mm)} /></label>
                <label className="field"><span>Глубина, см</span><input name="depth_cm" inputMode="decimal" defaultValue={toCm(product.dimensions?.depth_mm)} /></label>
              </div>
              <button className="btn btn-secondary" type="submit">Сохранить размеры</button>
            </PendingForm>
          </Card>
          <Card id="price" title="Цена" trailing={<span className="meta">обычная и акционная - разные поля</span>}>
            {conflict ? <ConflictPanel conflict={conflict} refreshHref={`/catalog/${id}#price`} /> : null}
            {!conflict && query.error && (query.your_amount || query.confirm) ? <div className="banner critical" role="alert">{query.error}</div> : null}
            <div className="stack-lg">
              {product.variants.map((variant) => (
                <PriceEditor
                  key={variant.id}
                  productId={id}
                  classification={product.classification}
                  variant={variant}
                  yourAmount={query.variant_id === variant.id ? query.your_amount ?? null : null}
                  needsConfirm={needsConfirm && query.variant_id === variant.id}
                  promoAvailable={promoAvailable}
                />
              ))}
              {product.variants.length === 0 ? <Status tone="critical" size="lg">У товара нет вариантов - цену задать некуда</Status> : null}
            </div>
          </Card>
          <Card id="media" title="Медиа" trailing={<span className="meta">{product.images?.length ?? 0} кадров</span>}>
            <MediaGallery productId={id} images={product.images ?? []} thumbnail={product.thumbnail ?? null} />
            <MediaUpload productId={id} />
          </Card>
        </div>
        <aside className="inspector" id="state">
          <div className="inspector-block">
            <h2 className="section-title">Готовность</h2>
            <ReadinessChecklist items={checklist} />
            {primary.kind !== "published" ? <p className="meta">Осталось: {primary.label}</p> : null}
            {bespoke ? <p className="meta">Продажа: по проекту. В корзину не кладётся</p> : null}
          </div>
          <div className="inspector-block">
            <h2 className="section-title">Цена</h2>
            {bespoke ? <p>По проекту. Цена обсуждается в заявке</p> : product.variants[0] ? (
              <>
                <p>Обычная {product.variants[0].rub_price ? formatRub(product.variants[0].rub_price.amount) : "Цена не задана"}</p>
                <p>{!promoAvailable ? "Данные акционной цены временно недоступны" : product.variants[0].promo_price ? `Акционная ${formatRub(product.variants[0].promo_price.amount)}` : "Без скидки"}</p>
                <a href="#price">Изменить цену</a>
              </>
            ) : <p>Цена не задана</p>}
          </div>
          <Card id="publish" title="Публикация">
            <StateBadge size="lg" state={publication} />
            <p className="meta">{product.readiness.visible ? "Покупатель видит товар на витрине" : published ? "Опубликован, но витрина его не отдаёт. Проверьте цену, фото и коллекцию" : "Покупатель пока не видит товар"}</p>
            {product.publish?.blockers?.length ? (
              <ul className="checklist">
                {product.publish.blockers.map((blocker) => (
                  <li key={blocker.code}><Status tone="critical">{blocker.message}</Status></li>
                ))}
              </ul>
            ) : null}
            {product.publish?.warnings?.length ? (
              <ul className="checklist">
                {product.publish.warnings.map((warning: { code: string; message: string } | string) => {
                  const text = typeof warning === "string" ? warning : warning.message
                  const key = typeof warning === "string" ? warning : warning.code
                  return <li key={key}><Status tone="attention">{text}</Status></li>
                })}
              </ul>
            ) : null}
            {!published && product.publish?.ready ? (
              <PendingForm action={`/api/catalog/${id}`}>
                <input type="hidden" name="intent" value="publish" />
                <button className="btn btn-primary full" type="submit">Опубликовать</button>
              </PendingForm>
            ) : null}
            {published ? (
              <>
                <ConfirmAction
                  action={`/api/catalog/${id}`}
                  fields={{ intent: "unpublish" }}
                  trigger="Снять с витрины"
                  triggerClassName="btn btn-danger full"
                  title="Снять товар с витрины?"
                  text="Покупатель перестанет видеть товар. Карточка, цены и фото сохранятся, вернуть можно будет кнопкой «Опубликовать»"
                  confirmLabel="Снять с витрины"
                />
                <p className="meta">Товар не удаляется. Покупатель перестанет его видеть</p>
              </>
            ) : null}
          </Card>
          <Card title="Тип товара">
            <p>{classificationLabel(product.classification)}</p>
            <p className="meta">{bespoke ? "Корзина закрыта, остаётся заявка" : "Можно положить в корзину"}</p>
            {classificationSafe ? (
              <SidePanel trigger="Изменить тип" triggerClassName="btn btn-ghost sm" title="Изменить тип товара">
                <p className="meta">Смена типа не публикует товар. SKU и адрес страницы остаются</p>
                <PendingForm action={`/api/catalog/${id}`} className="stack">
                  <input type="hidden" name="intent" value="classification" />
                  {(["STANDARD", "CONFIGURABLE", "BESPOKE"] as const).map((type) => (
                    <label key={type} className="check">
                      <input type="radio" name="classification" value={type} defaultChecked={product.classification === type} />
                      <span>{classificationLabel(type)}</span>
                    </label>
                  ))}
                  <label className="check"><input type="checkbox" name="confirm" value="1" /><span>Подтверждаю смену типа</span></label>
                  <button className="btn btn-secondary" type="submit">Сохранить тип</button>
                </PendingForm>
              </SidePanel>
            ) : (
              <p className="meta">Тип опубликованного товара меняется после снятия с витрины</p>
            )}
          </Card>
          <Card id="links" title="Связи">
            <ul className="checklist">
              <li><span className="meta">Коллекция</span> {product.collection_label || "не указана"}</li>
              <li><span className="meta">Детская навигация</span> {product.kids_nav ? "да" : "нет"}</li>
              <li><span className="meta">Витрина</span> <Link href="/promo">карточка на витрине</Link></li>
            </ul>
          </Card>
        </aside>
      </div>
    </>
  )
}
