const NBSP = "\u00a0"

export function formatRub(amount: number | string | null | undefined): string {
  const value = typeof amount === "string" ? Number(amount) : amount
  if (value == null || !Number.isFinite(value)) return "Сумма не пришла"
  const formatted = new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 0 }).format(value)
  return `${formatted}${NBSP}₽`
}

export function formatWhen(iso: string | null | undefined): string {
  if (!iso) return "Дата не пришла"
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return "Дата не пришла"
  return new Intl.DateTimeFormat("ru-RU", {
    timeZone: "Europe/Moscow",
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date)
}

export function ageLabel(iso: string | null | undefined, now = Date.now()): string {
  if (!iso) return "Возраст неизвестен"
  const then = Date.parse(iso)
  if (!Number.isFinite(then)) return "Возраст неизвестен"
  const hours = Math.max(0, (now - then) / 3_600_000)
  if (hours < 1) return "Меньше часа"
  if (hours < 48) return `${Math.floor(hours)}${NBSP}ч`
  return `${Math.floor(hours / 24)}${NBSP}дн`
}

export function paymentLabel(status: string | null | undefined): string {
  const map: Record<string, string> = {
    not_paid: "Не оплачен",
    awaiting: "Ждём оплату",
    captured: "Оплачен",
    refunded: "Возврат",
    partially_refunded: "Частичный возврат",
    canceled: "Оплата отменена",
  }
  if (!status) return "Оплата неизвестна"
  return map[status] ?? status
}

export function requestStatusLabel(status: string | null | undefined): string {
  const map: Record<string, string> = {
    new: "Новая",
    contacted: "Связались",
    quote_sent: "Расчёт отправлен",
    paid: "Оплачено",
    in_production: "В производстве",
    completed: "Завершена",
  }
  if (!status) return "Статус не пришёл"
  return map[status] ?? status
}

export function fulfillmentLabel(status: string | null | undefined): string {
  const map: Record<string, string> = {
    not_fulfilled: "Не отгружен",
    fulfilled: "Отгружен",
    shipped: "Передан",
    delivered: "Доставлен",
    canceled: "Отгрузка отменена",
    partially_fulfilled: "Частично отгружен",
  }
  if (!status) return "Отгрузка неизвестна"
  return map[status] ?? status
}

export function dimensionLine(dimensions: {
  height_mm?: number
  width_mm?: number
  depth_mm?: number
} | null | undefined): string {
  if (!dimensions) return "Размеры не указаны"
  const parts = [
    dimensions.width_mm ? `${dimensions.width_mm}${NBSP}мм в ширину` : null,
    dimensions.depth_mm ? `${dimensions.depth_mm}${NBSP}мм в глубину` : null,
    dimensions.height_mm ? `${dimensions.height_mm}${NBSP}мм в высоту` : null,
  ].filter(Boolean)
  return parts.length ? parts.join(", ") : "Размеры не указаны"
}

export function priceLine(display: { kind: string; amount?: number; min?: number; max?: number } | null | undefined): string {
  if (!display || display.kind === "none") return "Нет цены"
  if (display.kind === "single" && display.amount != null) return formatRub(display.amount)
  if (display.kind === "range" && display.min != null && display.max != null) {
    return `${formatRub(display.min)} - ${formatRub(display.max)}`
  }
  return "Нет цены"
}
