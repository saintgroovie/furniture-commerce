import { Text } from "@medusajs/ui"
import { SELLER_STATE_LABELS, type SellerSiteState } from "../../../lib/woodright-admin/seller-site-state"

type Props = {
  state: SellerSiteState
}

export function VisibilitySection({ state }: Props) {
  const labels = SELLER_STATE_LABELS[state]
  return (
    <section className="px-6 py-4">
      <Text weight="plus" className="mb-1">
        Видимость
      </Text>
      <Text size="small" className="text-ui-fg-subtle">
        {labels.helper}
      </Text>
    </section>
  )
}
