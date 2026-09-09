/**
 * Seller-facing RU labels for the "Промо в каталоге" workspace. Pure.
 */
import type { CatalogPromoAdminProduct } from "../../../lib/woodright-admin/catalog-promo-admin"

export function formatRubAdmin(amount: number | null | undefined): string {
  if (amount == null || !Number.isFinite(amount)) return "-"
  return `${new Intl.NumberFormat("ru-RU").format(Math.round(amount))}\u00a0₽`
}

/** Why the storefront skipped a slot product (preview). */
export function skipReasonLabel(reason: string): string {
  switch (reason) {
    case "not_found":
      return "Товар не найден"
    case "unpublished":
      return "Товар не опубликован - в промо не попадёт"
    case "bespoke":
      return "Товар по проекту - в промо не попадёт"
    case "not_purchasable":
      return "Товар нельзя купить отдельно"
    case "no_sale_price":
      return "Скидка не задана - товар не показывается"
    case "no_image":
      return "Нет фото - товар не показывается"
    default:
      return "Товар не показывается"
  }
}

export function blockerLabel(blocker: CatalogPromoAdminProduct["blocker"]): string | null {
  switch (blocker) {
    case null:
      return null
    case "unpublished":
    case "bespoke":
    case "no_sale_price":
    case "no_image":
      return skipReasonLabel(blocker)
    case "no_base_price":
      return "У товара нет обычной цены"
    case "sale_not_lower":
      return "Скидочная цена не ниже обычной"
    case "price_list_inactive":
      return "Скидки сейчас не действуют по расписанию"
    default:
      return "Товар не показывается"
  }
}

export function formatScheduleRu(startsAt: string | null, endsAt: string | null): string {
  const fmt = (iso: string) =>
    new Intl.DateTimeFormat("ru-RU", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      timeZone: "Europe/Moscow",
    }).format(new Date(iso))
  if (!startsAt && !endsAt) return "Без ограничений по датам"
  if (startsAt && endsAt) return `С ${fmt(startsAt)} до ${fmt(endsAt)}`
  if (startsAt) return `С ${fmt(startsAt)}`
  return `До ${fmt(endsAt!)}`
}

/** Local datetime-input value (YYYY-MM-DDTHH:mm) from ISO, or "". */
export function isoToLocalInput(iso: string | null): string {
  if (!iso) return ""
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ""
  const pad = (n: number) => String(n).padStart(2, "0")
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

export function localInputToIso(value: string): string | null {
  if (!value.trim()) return null
  const d = new Date(value)
  return Number.isNaN(d.getTime()) ? null : d.toISOString()
}

export function moveItem<T>(list: readonly T[], from: number, to: number): T[] {
  if (from === to || from < 0 || to < 0 || from >= list.length || to >= list.length) {
    return [...list]
  }
  const next = [...list]
  const [item] = next.splice(from, 1)
  next.splice(to, 0, item as T)
  return next
}

export function slotStatusLabel(input: {
  enabled: boolean
  visibleCount: number
  scheduleActive: boolean
}): { tone: "green" | "orange" | "grey"; text: string } {
  if (!input.enabled) return { tone: "grey", text: "Промо-окно выключено" }
  if (!input.scheduleActive) return { tone: "orange", text: "Включено, но вне расписания" }
  if (input.visibleCount === 0) {
    return { tone: "orange", text: "Включено, но показывать нечего" }
  }
  if (input.visibleCount === 1) return { tone: "green", text: "На сайте: 1 товар, без ротации" }
  return { tone: "green", text: `На сайте: ${input.visibleCount} товара в ротации` }
}
