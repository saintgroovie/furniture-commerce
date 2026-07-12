import { Badge, Button, Container, Text } from "@medusajs/ui"
import type { ProductReadinessVM, ReadinessItem } from "./readiness"
import type { StorefrontEligibilityVM } from "./storefront-eligibility"

type Props = {
  readiness: ProductReadinessVM
  eligibility: StorefrontEligibilityVM
  onField: (field: "title" | "description") => void
  onTab: (tab: "variants" | "gallery") => void
  onStock: () => void
}

function ItemActions({
  item,
  onField,
  onTab,
  onStock,
}: {
  item: ReadinessItem
  onField: Props["onField"]
  onTab: Props["onTab"]
  onStock: Props["onStock"]
}) {
  if (item.ok && !item.unverifiable) return null
  const { cta } = item
  if (cta.kind === "field") {
    return (
      <Button size="small" variant="secondary" onClick={() => onField(cta.field)}>
        {cta.label}
      </Button>
    )
  }
  if (cta.kind === "tab") {
    return (
      <Button size="small" variant="secondary" onClick={() => onTab(cta.tab)}>
        {cta.label}
      </Button>
    )
  }
  if (cta.kind === "stock") {
    return (
      <Button size="small" variant="secondary" onClick={onStock}>
        {cta.label}
      </Button>
    )
  }
  return null
}

function ItemRow(props: {
  item: ReadinessItem
  onField: Props["onField"]
  onTab: Props["onTab"]
  onStock: Props["onStock"]
}) {
  const { item } = props
  const tone = item.unverifiable
    ? "orange"
    : item.ok
      ? "green"
      : item.severity === "must"
        ? "red"
        : "orange"
  const status = item.unverifiable ? "не проверено" : item.ok ? "ок" : "нужно"

  return (
    <div className="flex flex-wrap items-start justify-between gap-2 border-b border-ui-border-base py-2 last:border-b-0">
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <Text size="small" weight="plus">
            {item.label}
          </Text>
          <Badge color={tone} size="small">
            {item.severity === "must" ? "обязательно" : "желательно"} · {status}
          </Badge>
        </div>
        {item.detail ? (
          <Text size="xsmall" className="mt-1 text-ui-fg-subtle">
            {item.detail}
          </Text>
        ) : null}
      </div>
      <ItemActions {...props} />
    </div>
  )
}

export function ProductReadinessChecklist({
  readiness,
  eligibility,
  onField,
  onTab,
  onStock,
}: Props) {
  const eligibilityTone =
    eligibility.listed_in_main_catalog || eligibility.listed_in_kids_catalog ? "green" : "orange"

  return (
    <Container className="p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Text weight="plus">Заполненность карточки</Text>
        <Badge
          color={
            readiness.verification === "ready"
              ? "green"
              : readiness.verification === "unverified"
                ? "orange"
                : "red"
          }
        >
          {readiness.summary_label}
        </Badge>
      </div>
      <Text size="xsmall" className="mt-1 text-ui-fg-subtle">
        Это про поля товара, а не про попадание в каталог на сайте. Цены и галерея сохраняются во
        вкладках.
      </Text>
      {readiness.buyer_price_note ? (
        <Text size="xsmall" className="mt-1 text-ui-fg-subtle">
          {readiness.buyer_price_note}
        </Text>
      ) : null}
      <div className="mt-2">
        {readiness.items.map((item) => (
          <ItemRow
            key={item.id}
            item={item}
            onField={onField}
            onTab={onTab}
            onStock={onStock}
          />
        ))}
      </div>

      <div className="mt-4 border-t border-ui-border-base pt-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <Text weight="plus">На витрине</Text>
          <Badge color={eligibilityTone}>{eligibility.summary_label}</Badge>
        </div>
        <Text size="xsmall" className="mt-1 text-ui-fg-subtle">
          {eligibility.detail}
        </Text>
      </div>
    </Container>
  )
}
