import type { OrderAxes as Axes } from "@/lib/order-presentation"
import { StateBadge } from "@/components/status"

/** Three independent axes. None is a sub-status of another. */
export function OrderAxesInline({ axes }: { axes: Axes }) {
  return (
    <>
      <StateBadge size="lg" state={{ ...axes.money, label: `Деньги: ${axes.money.label}` }} />
      <StateBadge size="lg" state={{ ...axes.delivery, label: `Доставка: ${axes.delivery.label}` }} />
      <StateBadge size="lg" state={{ ...axes.manufacturing, label: `Изготовление: ${axes.manufacturing.label}` }} />
    </>
  )
}

export function OrderAxesCells({ axes }: { axes: Axes }) {
  return (
    <>
      <td><StateBadge state={axes.money} /></td>
      <td><StateBadge state={axes.delivery} /></td>
      <td><StateBadge state={axes.manufacturing} /></td>
    </>
  )
}
