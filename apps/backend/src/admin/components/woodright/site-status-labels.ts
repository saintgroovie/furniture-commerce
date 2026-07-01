import type { SiteReadinessResponse } from "../../../lib/woodright-admin/site-readiness"

export type { SiteReadinessResponse }

export function ctaLabel(cta: SiteReadinessResponse["storefront"]["expected_cta"]): string {
  switch (cta) {
    case "add_to_cart":
      return "Добавить в корзину"
    case "request_quote":
      return "Оставить заявку"
    case "project_request":
      return "Получить расчёт"
    default:
      return "Неизвестно"
  }
}

export function productTypeBadge(type: string): string {
  switch (type) {
    case "STANDARD":
      return "Готовый"
    case "CONFIGURABLE":
      return "С выбором исполнения"
    case "BESPOKE":
      return "По проекту"
    default:
      return type
  }
}

export function severityColor(severity: "info" | "warning" | "error"): "green" | "orange" | "red" | "grey" {
  switch (severity) {
    case "error":
      return "red"
    case "warning":
      return "orange"
    case "info":
    default:
      return "grey"
  }
}

export function resolveAdminImageSrc(url: string): string {
  if (url.startsWith("http://") || url.startsWith("https://")) return url
  if (url.startsWith("/static/")) return url
  if (url.startsWith("static/")) return `/${url}`
  return url
}
