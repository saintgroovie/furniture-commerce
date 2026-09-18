import { Text } from "@medusajs/ui"
import type { ReactNode } from "react"
import { Link, useLocation } from "react-router-dom"

export type DeskSection =
  | "today"
  | "catalog"
  | "requests"
  | "people"
  | "rooms"
  | "promo"
  | "media"
  | "production"
  | "site"

const ITEMS: Array<{ id: DeskSection; label: string; to: string }> = [
  { id: "today", label: "Сегодня", to: "/woodright" },
  { id: "catalog", label: "Каталог", to: "/woodright/products" },
  { id: "requests", label: "Заявки", to: "/woodright/requests" },
  { id: "people", label: "Люди", to: "/woodright/people" },
  { id: "rooms", label: "Комнаты", to: "/woodright/rooms" },
  { id: "promo", label: "Акции", to: "/woodright/catalog-promo" },
  { id: "media", label: "Медиа", to: "/woodright/media" },
  { id: "production", label: "Производство", to: "/woodright/production" },
  { id: "site", label: "Сайт", to: "/woodright/contacts" },
]

export function sectionFromPath(pathname: string): DeskSection {
  if (pathname.startsWith("/woodright/products")) return "catalog"
  if (pathname.startsWith("/woodright/requests")) return "requests"
  if (pathname.startsWith("/woodright/people")) return "people"
  if (pathname.startsWith("/woodright/rooms")) return "rooms"
  if (pathname.startsWith("/woodright/catalog-promo")) return "promo"
  if (pathname.startsWith("/woodright/media")) return "media"
  if (pathname.startsWith("/woodright/production")) return "production"
  if (pathname.startsWith("/woodright/contacts") || pathname.startsWith("/woodright/partners")) {
    return "site"
  }
  return "today"
}

export function DeskNav({ active }: { active?: DeskSection }) {
  const location = useLocation()
  const current = active ?? sectionFromPath(location.pathname)

  return (
    <nav className="flex flex-wrap gap-2 px-6 py-3 border-b border-ui-border-base" aria-label="Стол продавца">
      {ITEMS.map((item) => {
        const isActive = item.id === current
        return (
          <Link
            key={item.id}
            to={item.to}
            className={
              isActive
                ? "text-sm text-ui-fg-base font-medium underline underline-offset-4"
                : "text-sm text-ui-fg-subtle"
            }
          >
            {item.label}
          </Link>
        )
      })}
    </nav>
  )
}

export function DeskFrame({
  title,
  lead,
  children,
  active,
}: {
  title: string
  lead?: string
  active?: DeskSection
  children: ReactNode
}) {
  return (
    <div className="flex flex-col">
      <div className="px-6 pt-4">
        <Text size="small" className="text-ui-fg-subtle">
          Стол продавца
        </Text>
        <h1 className="text-ui-fg-base text-xl font-medium mt-1">{title}</h1>
        {lead ? (
          <Text size="small" className="text-ui-fg-subtle mt-1">
            {lead}
          </Text>
        ) : null}
      </div>
      <DeskNav active={active} />
      {children}
    </div>
  )
}
