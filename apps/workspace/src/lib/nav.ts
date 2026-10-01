/**
 * Approved Woodright OS top-level IA. Pure data: the shell renders it, tests pin it.
 * «Входящие» is DESIGN_FUTURE and must not appear here until mail is connected.
 */
export type NavItem = {
  id: "today" | "clients" | "orders" | "products" | "storefront"
  label: string
  href: string
  glyph: string
  /** Path prefixes that light this item up (legacy routes included). */
  matches: string[]
  /** Shown in the 390 bottom navigation. */
  mobile: boolean
}

export const NAV: readonly NavItem[] = [
  { id: "today", label: "Сегодня", href: "/today", glyph: "◆", matches: ["/today"], mobile: true },
  {
    id: "clients",
    label: "Клиенты",
    href: "/clients",
    glyph: "◯",
    matches: ["/clients", "/people", "/requests", "/companies"],
    mobile: true,
  },
  { id: "orders", label: "Заказы", href: "/orders", glyph: "▭", matches: ["/orders"], mobile: true },
  {
    id: "products",
    label: "Товары",
    href: "/catalog",
    glyph: "▣",
    matches: ["/catalog", "/rooms", "/products", "/media"],
    mobile: true,
  },
  {
    id: "storefront",
    label: "Витрина",
    href: "/promo",
    glyph: "◫",
    matches: ["/promo", "/site", "/storefront"],
    mobile: false,
  },
]

export function activeNavId(pathname: string | null | undefined): NavItem["id"] | null {
  if (!pathname) return null
  for (const item of NAV) {
    if (item.matches.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`) || pathname.startsWith(`${prefix}?`))) {
      return item.id
    }
  }
  return null
}

/** Legacy employee URLs kept alive through redirects. Technical API routes are untouched. */
export const LEGACY_REDIRECTS: Record<string, string> = {
  "/people": "/clients?mode=people",
  "/requests": "/clients?mode=requests",
  "/media": "/catalog?filter=missing_media",
  "/site": "/promo",
  "/products": "/catalog",
  "/storefront": "/promo",
}

export const ORDER_MODES: ReadonlyArray<{ id: string; label: string; href: string }> = [
  { id: "list", label: "Список", href: "/orders" },
  { id: "production", label: "Производство", href: "/orders/production" },
]

export const CATALOG_MODES: ReadonlyArray<{ id: string; label: string; href: string }> = [
  { id: "products", label: "Товары", href: "/catalog" },
  { id: "rooms", label: "Комнаты", href: "/rooms" },
]
