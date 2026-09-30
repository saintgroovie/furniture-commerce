"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"

const NAV = [
  ["Сегодня", "/today"],
  ["Заявки", "/requests"],
  ["Заказы", "/orders"],
  ["Люди", "/people"],
  ["Каталог", "/catalog"],
  ["Комнаты", "/rooms"],
  ["Акции", "/promo"],
  ["Медиа", "/media"],
  ["Сайт", "/site"],
] as const

export function DeskNav() {
  const path = usePathname()
  return (
    <nav className="nav" aria-label="Разделы">
      {NAV.map(([label, href]) => {
        const current = path === href || path.startsWith(`${href}/`)
        return (
          <Link key={href} href={href} aria-current={current ? "page" : undefined}>
            {label}
          </Link>
        )
      })}
    </nav>
  )
}
