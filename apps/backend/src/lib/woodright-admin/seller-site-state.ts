import type { SellerProduct } from "./seller-product-types"

export type SellerSiteState = "on_site" | "hidden" | "hidden_incomplete" | "published_not_shown"

export type SellerStateLabel = {
  badge: string
  color: "green" | "grey" | "orange"
  helper: string
}

export const SELLER_STATE_LABELS: Record<SellerSiteState, SellerStateLabel> = {
  on_site: {
    badge: "На сайте",
    color: "green",
    helper: "Покупатели видят товар",
  },
  hidden: {
    badge: "Скрыт",
    color: "grey",
    helper: "Готов к публикации",
  },
  hidden_incomplete: {
    badge: "Скрыт",
    color: "grey",
    helper: "Пока нельзя опубликовать",
  },
  published_not_shown: {
    badge: "Не показывается",
    color: "orange",
    helper: "Опубликован, но покупатель его не найдёт",
  },
}

export function sellerSiteState(product: SellerProduct): SellerSiteState {
  const published = product.status === "published"
  const visible = product.readiness.visible
  if (published && visible) return "on_site"
  if (published && !visible) return "published_not_shown"
  if (product.publish.ready) return "hidden"
  return "hidden_incomplete"
}

export type AttentionChip = {
  code: "published_invisible" | "missing_price" | "missing_media"
  label: string
}

/** Highest-priority list chip. Draft is the primary badge, not a chip. */
export function highestAttentionChip(codes: string[]): AttentionChip | null {
  if (codes.includes("published_invisible")) {
    return { code: "published_invisible", label: "Не показывается" }
  }
  if (codes.includes("missing_price")) {
    return { code: "missing_price", label: "Без цены" }
  }
  if (codes.includes("missing_media")) {
    return { code: "missing_media", label: "Без фото" }
  }
  return null
}
