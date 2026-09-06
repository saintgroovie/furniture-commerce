import { Badge, Container, Heading, StatusBadge, Text } from "@medusajs/ui"
import type { SiteReadinessResponse } from "../../../lib/woodright-admin/site-readiness"
import { localizeCollectionDisplayTitle } from "../../lib/collection-display-labels"
import { ctaLabel, productTypeBadge, severityColor } from "./site-status-labels"

type Props = {
  data: SiteReadinessResponse | null
  loading: boolean
  error: string | null
  rawMetadata?: Record<string, unknown> | null
}

function BoolBadge({ value, yes, no }: { value: boolean; yes: string; no: string }) {
  return (
    <StatusBadge color={value ? "green" : "grey"}>
      {value ? yes : no}
    </StatusBadge>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="px-6 py-4">
      <Heading level="h3" className="mb-3">
        {title}
      </Heading>
      {children}
    </div>
  )
}

export function WoodrightSiteStatusPanel({ data, loading, error, rawMetadata }: Props) {
  if (loading) {
    return (
      <Container className="p-6">
        <Text size="small" className="text-ui-fg-subtle">
          Загрузка статуса на сайте…
        </Text>
      </Container>
    )
  }

  if (error) {
    return (
      <Container className="p-6">
        <Text size="small" className="text-ui-fg-error">
          {error}
        </Text>
      </Container>
    )
  }

  if (!data) return null

  const { product, storefront, placement, media, warnings } = data

  return (
    <Container className="divide-y p-0">
      <div className="flex items-center justify-between px-6 py-4">
        <Heading level="h2">Статус на сайте Woodright</Heading>
        <Badge size="small" color="grey">
          read-only
        </Badge>
      </div>

      <Section title="Видимость на витрине">
        <div className="flex flex-col gap-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <Text size="small" weight="plus" className="text-ui-fg-subtle w-40">
              Статус Medusa
            </Text>
            <StatusBadge color={product.status === "published" ? "green" : "grey"}>
              {product.status}
            </StatusBadge>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Text size="small" weight="plus" className="text-ui-fg-subtle w-40">
              Каталог
            </Text>
            <BoolBadge value={storefront.visible_in_catalog} yes="Виден" no="Скрыт" />
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Text size="small" weight="plus" className="text-ui-fg-subtle w-40">
              Детская
            </Text>
            <BoolBadge value={storefront.visible_in_kids} yes="Виден" no="Скрыт" />
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Text size="small" weight="plus" className="text-ui-fg-subtle w-40">
              По проекту
            </Text>
            <BoolBadge value={storefront.visible_in_project} yes="Виден" no="Скрыт" />
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Text size="small" weight="plus" className="text-ui-fg-subtle w-40">
              Корзина
            </Text>
            <BoolBadge
              value={storefront.cart_allowed}
              yes="Разрешена"
              no="Заблокирована"
            />
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Text size="small" weight="plus" className="text-ui-fg-subtle w-40">
              Ожидаемая кнопка
            </Text>
            <Badge size="small">{ctaLabel(storefront.expected_cta)}</Badge>
          </div>
        </div>
      </Section>

      <Section title="Режим продажи">
        <div className="flex flex-col gap-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <Text size="small" weight="plus" className="text-ui-fg-subtle w-40">
              Тип товара
            </Text>
            <Badge size="small">
              {storefront.product_type} - {productTypeBadge(storefront.product_type)}
            </Badge>
          </div>
          {storefront.buyer_facing_section && (
            <div className="flex flex-wrap items-center gap-2">
              <Text size="small" weight="plus" className="text-ui-fg-subtle w-40">
                Раздел каталога
              </Text>
              <Text size="small">{storefront.buyer_facing_section}</Text>
            </div>
          )}
          {storefront.launch_mode && (
            <div className="flex flex-wrap items-center gap-2">
              <Text size="small" weight="plus" className="text-ui-fg-subtle w-40">
                Launch mode
              </Text>
              <Text size="small">{storefront.launch_mode}</Text>
            </div>
          )}
          {storefront.price_display_policy && (
            <div className="flex flex-wrap items-center gap-2">
              <Text size="small" weight="plus" className="text-ui-fg-subtle w-40">
                Price display
              </Text>
              <Text size="small">{storefront.price_display_policy}</Text>
            </div>
          )}
          {product.collection && (
            <div className="flex flex-wrap items-center gap-2">
              <Text size="small" weight="plus" className="text-ui-fg-subtle w-40">
                Коллекция
              </Text>
              <Text size="small">
                {localizeCollectionDisplayTitle(product.collection) ?? product.collection}
              </Text>
            </div>
          )}
        </div>
      </Section>

      <Section title="Размещение в каталоге">
        <ul className="flex flex-col gap-y-2">
          {placement.map((p) => (
            <li key={p.surface} className="flex flex-col gap-y-1 border border-ui-border-base rounded-md p-3">
              <div className="flex items-center justify-between gap-2">
                <Text size="small" weight="plus">
                  {p.surface}
                </Text>
                <BoolBadge value={p.visible} yes="Да" no="Нет" />
              </div>
              <Text size="xsmall" className="text-ui-fg-subtle">
                {p.because}
              </Text>
            </li>
          ))}
        </ul>
      </Section>

      <Section title="Готовность медиа">
        <div className="flex flex-col gap-y-3">
          <div className="flex flex-wrap gap-4 text-ui-fg-subtle">
            <Text size="small">Галерея: {media.gallery_count}</Text>
            <Text size="small">Исполнения: {media.execution_variant_count}</Text>
            {media.media_health.checked && (
              <Text size="small">Проверка static: missing {media.missing.length}</Text>
            )}
          </div>
          {media.thumbnail_health.issues.length > 0 && (
            <div className="rounded-md border border-ui-border-base bg-ui-bg-subtle p-3">
              <Text size="small" weight="plus" className="mb-1">
                Миниатюра в списке админки
              </Text>
              <Text size="xsmall" className="text-ui-fg-subtle mb-2">
                Medusa Admin: список товаров - поле product.thumbnail; таблица SKU/вариантов на карточке
                товара - variant.thumbnail (без fallback на галерею).
              </Text>
              {media.thumbnail_health.variants_missing_thumbnail > 0 && (
                <Text size="xsmall" className="text-ui-fg-subtle mb-2">
                  Вариантов без миниатюры: {media.thumbnail_health.variants_missing_thumbnail}
                </Text>
              )}
              <ul className="flex flex-col gap-y-1">
                {media.thumbnail_health.issues.map((issue) => (
                  <li key={issue.code}>
                    <Text size="xsmall">
                      {issue.code}: {issue.message}
                    </Text>
                  </li>
                ))}
              </ul>
            </div>
          )}
          <div className="flex flex-wrap gap-4">
            {media.admin_list_thumbnail && (
              <div>
                <Text size="xsmall" className="text-ui-fg-subtle mb-1">
                  Список админки
                </Text>
                <img
                  src={media.admin_list_thumbnail}
                  alt="admin list thumbnail"
                  className="h-20 w-20 rounded-md border border-ui-border-base object-cover"
                  onError={(e) => {
                    ;(e.target as HTMLImageElement).style.opacity = "0.35"
                  }}
                />
              </div>
            )}
            {media.effective_thumbnail &&
              media.effective_thumbnail !== media.thumbnail && (
                <div>
                  <Text size="xsmall" className="text-ui-fg-subtle mb-1">
                    Эффективная (как на витрине)
                  </Text>
                  <img
                    src={
                      media.effective_thumbnail.startsWith("/")
                        ? media.effective_thumbnail
                        : media.effective_thumbnail
                    }
                    alt="effective thumbnail"
                    className="h-20 w-20 rounded-md border border-ui-border-base object-cover"
                    onError={(e) => {
                      ;(e.target as HTMLImageElement).style.opacity = "0.35"
                    }}
                  />
                </div>
              )}
          </div>
          {media.images.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {media.images.slice(0, 6).map((url) => (
                <img
                  key={url}
                  src={url.startsWith("/") ? url : url}
                  alt=""
                  className="h-16 w-16 rounded-md border border-ui-border-base object-cover"
                  onError={(e) => {
                    ;(e.target as HTMLImageElement).style.opacity = "0.35"
                  }}
                />
              ))}
            </div>
          )}
        </div>
      </Section>

      {media.execution_variants.length > 0 && (
        <Section title="Варианты исполнения">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="text-ui-fg-subtle border-b border-ui-border-base">
                  <th className="py-2 pr-3">Ключ</th>
                  <th className="py-2 pr-3">Label</th>
                  <th className="py-2 pr-3">Gallery</th>
                </tr>
              </thead>
              <tbody>
                {media.execution_variants.map((v) => (
                  <tr key={v.key} className="border-b border-ui-border-base">
                    <td className="py-2 pr-3">{v.key}</td>
                    <td className="py-2 pr-3">{v.label ?? "-"}</td>
                    <td className="py-2 pr-3">{v.gallery_count}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Section>
      )}

      <Section title="Предупреждения">
        {warnings.length === 0 ? (
          <Text size="small" className="text-ui-fg-subtle">
            Нет предупреждений
          </Text>
        ) : (
          <ul className="flex flex-col gap-y-2">
            {warnings.map((w) => (
              <li
                key={`${w.code}-${w.message}`}
                className="flex items-start gap-2 rounded-md border border-ui-border-base p-3"
              >
                <StatusBadge color={severityColor(w.severity)}>{w.severity}</StatusBadge>
                <div>
                  <Text size="small" weight="plus">
                    {w.code}
                  </Text>
                  <Text size="small" className="text-ui-fg-subtle">
                    {w.message}
                  </Text>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Section>

      {rawMetadata != null && (
        <Section title="Raw metadata">
          <details>
            <summary className="cursor-pointer text-sm text-ui-fg-subtle">
              metadata JSON
            </summary>
            <pre className="mt-2 max-h-64 overflow-auto rounded-md bg-ui-bg-subtle p-3 text-xs">
              {JSON.stringify(rawMetadata, null, 2)}
            </pre>
          </details>
        </Section>
      )}
    </Container>
  )
}
