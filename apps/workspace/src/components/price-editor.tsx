import { ConfirmAction } from "@/components/confirm-action"
import { FirstPriceFields } from "@/components/first-price-fields"
import { PendingForm } from "@/components/pending-form"
import { Status } from "@/components/status"
import { formatRub } from "@/lib/format"
import { priceEditorState } from "@/lib/price-presentation"

export type PriceVariant = {
  id: string
  sku: string | null
  title: string | null
  rub_price: { id: string; amount: number } | null
  promo_price?: { amount: number; price_list_id: string } | null
}

/**
 * Regular price and promotional price are two separate stored values.
 * The percent is computed for display only. «Цена не задана» is never shown as 0.
 */
export function PriceEditor({
  productId,
  classification,
  variant,
  yourAmount,
  needsConfirm,
  promoAvailable = true,
}: {
  productId: string
  classification: string
  variant: PriceVariant
  yourAmount?: string | null
  needsConfirm?: boolean
  /** False when the backend could not resolve the catalog promo price list this time. */
  promoAvailable?: boolean
}) {
  const action = `/api/catalog/${productId}`
  const state = priceEditorState({ classification, base: variant.rub_price?.amount, promo: variant.promo_price?.amount })
  const name = variant.sku || variant.title || "Вариант"
  if (state.kind === "bespoke") {
    return <Status tone="neutral" size="lg">По проекту: цена обсуждается в заявке, в корзину не кладётся</Status>
  }
  if (state.kind === "missing") {
    return (
      <div className="stack">
        <div className="row" style={{ justifyContent: "space-between" }}>
          <span className="object-row-title">{name}</span>
          <Status tone="critical" size="lg">Цена не задана</Status>
        </div>
        <PendingForm action={action} className="stack">
          <input type="hidden" name="intent" value="price" />
          <input type="hidden" name="create" value="1" />
          <input type="hidden" name="variant_id" value={variant.id} />
          <FirstPriceFields defaultValue={yourAmount ?? ""} />
          <button className="btn btn-primary" type="submit">Задать цену</button>
        </PendingForm>
      </div>
    )
  }
  return (
    <div className="stack">
      <div className="row" style={{ justifyContent: "space-between" }}>
        <span className="object-row-title">{name}</span>
        {!promoAvailable ? (
          <Status tone="waiting">Данные акционной цены временно недоступны</Status>
        ) : state.promo && state.promoValid ? (
          <Status tone="attention">Акция −{state.percent}%</Status>
        ) : state.promo ? (
          <Status tone="critical">Акция не ниже обычной цены</Status>
        ) : (
          <Status tone="neutral">Без акции</Status>
        )}
      </div>
      <div className="price-grid">
        <PendingForm action={action} className="price-col">
          <input type="hidden" name="intent" value="price" />
          <input type="hidden" name="variant_id" value={variant.id} />
          <input type="hidden" name="expected_amount" value={state.base} />
          <span className="meta">Обычная цена</span>
          <span className="money-lg">{formatRub(state.base)}</span>
          <label className="field">
            <span>Было {formatRub(state.base)} → будет, ₽</span>
            <input name="amount" inputMode="numeric" defaultValue={yourAmount ?? state.base} />
          </label>
          {needsConfirm ? <Status tone="attention">Сильное изменение. Отметьте подтверждение и сохраните ещё раз</Status> : null}
          <label className="check">
            <input type="checkbox" name="confirm" value="1" />
            <span>Подтверждаю сильное изменение</span>
          </label>
          <button className="btn btn-secondary" type="submit">Сохранить обычную цену</button>
        </PendingForm>
        {!promoAvailable ? (
          <div className="price-col">
            <span className="meta">Акционная цена</span>
            <Status tone="waiting" size="lg">Данные акционной цены временно недоступны</Status>
            <span className="meta">Формы нет, пока сервер не подтвердит акционную цену</span>
          </div>
        ) : (
        <PendingForm action={action} className="price-col">
          <input type="hidden" name="intent" value="promo" />
          <input type="hidden" name="variant_id" value={variant.id} />
          <span className="meta">Акционная цена</span>
          <span className="money-lg">{state.promo ? formatRub(state.promo) : "нет"}</span>
          <label className="field">
            <span>Акционная, меньше обычной, ₽</span>
            <input name="amount" inputMode="numeric" defaultValue={state.promo ?? ""} />
          </label>
          <div className="row">
            <button className="btn btn-secondary" type="submit">Записать акцию</button>
          </div>
          <span className="meta">Пишется в прайс-лист каталога. Процент считается, не хранится</span>
        </PendingForm>
        )}
      </div>
      {state.promo && promoAvailable ? (
        <div className="row" style={{ justifyContent: "space-between" }}>
          <span className="meta">
            {state.promoValid
              ? `В прайс-листе: ${formatRub(state.promo)} вместо ${formatRub(state.base)}. Что видит покупатель - на экране Витрина`
              : `Сохранённая акция ${formatRub(state.promo)} не ниже обычной ${formatRub(state.base)} и не сработает`}
          </span>
          <ConfirmAction
            action={action}
            fields={{ intent: "promo", variant_id: variant.id, remove: "1" }}
            trigger="Убрать акцию"
            triggerClassName="btn btn-ghost sm"
            title="Убрать акционную цену?"
            text={`Строка ${formatRub(state.promo)} удалится из прайс-листа. Обычная цена ${formatRub(state.base)} останется`}
            confirmLabel="Убрать акцию"
          />
        </div>
      ) : promoAvailable ? (
        <p className="meta">Обычная цена {formatRub(state.base)}. Акции нет</p>
      ) : null}
    </div>
  )
}
