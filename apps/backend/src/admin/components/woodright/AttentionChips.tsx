import { Badge } from "@medusajs/ui"

const CHIP_LABELS: Record<string, string> = {
  draft: "Черновик",
  missing_media: "Без фото",
  missing_price: "Нет цены",
  published_invisible: "Не виден",
}

const CHIP_ORDER = ["draft", "missing_media", "missing_price", "published_invisible"] as const

export function AttentionChips({ codes }: { codes: string[] }) {
  const chips = CHIP_ORDER.filter((code) => codes.includes(code))
  if (chips.length === 0) {
    return <span className="text-ui-fg-muted">нет</span>
  }
  return (
    <div className="flex flex-wrap gap-1">
      {chips.map((code) => (
        <Badge key={code} size="2xsmall" color="orange">
          {CHIP_LABELS[code]}
        </Badge>
      ))}
    </div>
  )
}

export function sellerStatusLabel(status: string, visible: boolean): string {
  if (status !== "published") return "Скрыт"
  if (visible) return "На сайте"
  return "Опубликован"
}
