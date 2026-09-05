import { Badge } from "@medusajs/ui"

const CHIP_LABELS: Record<string, string> = {
  missing_media: "Без фото",
  missing_price: "Без цены",
  published_invisible: "Не показывается",
}

export function AttentionChipBadge({ code }: { code: string }) {
  const label = CHIP_LABELS[code]
  if (!label) return null
  return (
    <Badge size="2xsmall" color="orange">
      {label}
    </Badge>
  )
}
