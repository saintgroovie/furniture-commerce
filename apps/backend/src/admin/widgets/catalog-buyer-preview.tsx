import { defineWidgetConfig } from "@medusajs/admin-sdk"
import { useMemo, type CSSProperties } from "react"
import { resolvePublicProductTitle } from "../../lib/catalog-normalization/public-title"
import { isMedusaStubOptionTitle } from "../../lib/catalog-normalization/option-taxonomy"

type ProductData = {
  id?: string
  title?: string
  handle?: string
  metadata?: Record<string, unknown>
  options?: Array<{ title?: string; values?: Array<{ value?: string }> }>
  variants?: Array<{
    id?: string
    title?: string
    sku?: string
    prices?: Array<{ amount?: number; currency_code?: string }>
  }>
}

const box: CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: 8,
  padding: 16,
  background: "var(--bg-base, #fff)",
  borderRadius: 8,
  border: "1px solid var(--border-base, #e5e5e5)",
}

const muted: CSSProperties = { color: "var(--fg-muted, #666)", fontSize: 12 }

/**
 * Read-only buyer preview so managers see what the storefront will show,
 * without treating SKU / Medusa stub options as primary labels.
 */
const CatalogBuyerPreviewWidget = ({ data }: { data?: ProductData }) => {
  const preview = useMemo(() => {
    const resolved = resolvePublicProductTitle({
      title: data?.title,
      handle: data?.handle,
      metadata: data?.metadata ?? null,
    })
    const options = (data?.options ?? [])
      .filter((o) => o?.title && !isMedusaStubOptionTitle(o.title))
      .map((o) => ({
        title: o.title!,
        values: (o.values ?? [])
          .map((v) => v?.value)
          .filter((v): v is string => !!v && !isMedusaStubOptionTitle(v)),
      }))
      .filter((o) => o.values.length > 0)

    const meta = data?.metadata ?? {}
    const execAxes: string[] = []
    for (const key of [
      "material_tiers",
      "finish_color_executions",
      "paint_finish_executions",
      "fabric_upholstery_executions",
      "upholstery_color_executions",
      "frame_material_executions",
      "headboard_model_executions",
    ]) {
      const v = meta[key]
      if (Array.isArray(v) && v.length) execAxes.push(`${key}: ${v.length}`)
      else if (v && typeof v === "object") execAxes.push(`${key}: object`)
    }

    const defaultVariant = data?.variants?.[0]
    const price = defaultVariant?.prices?.[0]
    const sku = defaultVariant?.sku ?? null

    return {
      resolved,
      options,
      execAxes,
      defaultVariantTitle: defaultVariant?.title ?? null,
      sku,
      priceLabel:
        price?.amount != null
          ? `${(Number(price.amount) / (String(price.currency_code).toLowerCase() === "rub" ? 1 : 1)).toLocaleString("ru-RU")} ${price.currency_code ?? ""}`.trim()
          : null,
      classification: typeof meta.product_type === "string" ? meta.product_type : null,
      legacyTitle:
        typeof meta.legacy_title === "string"
          ? meta.legacy_title
          : typeof meta.canonical_name === "string"
            ? meta.canonical_name
            : null,
    }
  }, [data])

  if (!data?.id) return null

  return (
    <div style={box}>
      <div style={{ fontWeight: 600 }}>Название на сайте</div>
      <div>{preview.resolved.public_title}</div>
      <div style={muted}>
        источник: {preview.resolved.source}
        {preview.resolved.pedestal_code
          ? ` · код тумб: ${preview.resolved.pedestal_code}`
          : ""}
      </div>

      <div style={{ fontWeight: 600, marginTop: 8 }}>Опции на сайте</div>
      {preview.execAxes.length > 0 ? (
        <ul style={{ margin: 0, paddingLeft: 18 }}>
          {preview.execAxes.map((a) => (
            <li key={a}>{a}</li>
          ))}
        </ul>
      ) : preview.options.length > 0 ? (
        <ul style={{ margin: 0, paddingLeft: 18 }}>
          {preview.options.map((o) => (
            <li key={o.title}>
              {o.title}: {o.values.join(", ")}
            </li>
          ))}
        </ul>
      ) : (
        <div style={muted}>Нет отдельных buyer-facing option groups (Medusa Default скрыт)</div>
      )}

      <div style={{ fontWeight: 600, marginTop: 8 }}>Вариант по умолчанию</div>
      <div style={muted}>
        {preview.defaultVariantTitle &&
        !isMedusaStubOptionTitle(preview.defaultVariantTitle)
          ? preview.defaultVariantTitle
          : preview.resolved.public_title}
        {preview.sku ? ` · SKU ${preview.sku}` : ""}
      </div>

      <div style={{ fontWeight: 600, marginTop: 8 }}>
        Сырая цена (первый variant в admin payload)
      </div>
      <div>
        {preview.priceLabel ?? "цена не загружена в виджет"}
      </div>
      <div style={muted}>
        Не гарантирует совпадение со storefront (material tiers / calculated_price)
      </div>

      <div style={{ fontWeight: 600, marginTop: 8 }}>Technical / legacy</div>
      <div style={muted}>
        handle: {data.handle ?? "—"}
        {preview.legacyTitle ? ` · legacy/canonical: ${preview.legacyTitle}` : ""}
      </div>
    </div>
  )
}

export const config = defineWidgetConfig({
  zone: "product.details.after",
})

export default CatalogBuyerPreviewWidget
