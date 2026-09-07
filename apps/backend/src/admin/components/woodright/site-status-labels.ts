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

/**
 * Admin thumbnails must load from the current Medusa origin.
 * Stored file URLs are often stamped `http://localhost:9000/static/...` from
 * another local runtime; the browser would then hit canonical `:9000`.
 * Loopback `/static` and `/uploads` become same-origin relative paths.
 */
export function resolveAdminImageSrc(url: string): string {
  const t = typeof url === "string" ? url.trim() : ""
  if (!t) return t
  if (/^https?:\/\//i.test(t)) {
    try {
      const parsed = new URL(t)
      const host = parsed.hostname.toLowerCase()
      const loopback =
        host === "localhost" ||
        host === "127.0.0.1" ||
        host === "::1" ||
        host === "[::1]"
      const localFile =
        parsed.pathname.startsWith("/static/") ||
        parsed.pathname.startsWith("/uploads/")
      if (loopback && localFile) {
        return `${parsed.pathname}${parsed.search}${parsed.hash}`
      }
    } catch {
      return t
    }
    return t
  }
  if (
    t.startsWith("/static/") ||
    t.startsWith("/uploads/") ||
    t.startsWith("/product-static/")
  ) {
    return t
  }
  if (t.startsWith("static/")) return `/${t}`
  return t
}
