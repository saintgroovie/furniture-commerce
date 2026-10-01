/**
 * Cmd+K commands are navigation only. A command opens an object or a filtered
 * list; it never executes a write (publish, unpublish, price, stage) on Enter.
 */
export type Command = { title: string; href: string; hint: string }

export const COMMANDS: ReadonlyArray<Command> = [
  { title: "Открыть Сегодня", href: "/today", hint: "очередь дел" },
  { title: "Заявки без ответа", href: "/clients?mode=requests&filter=open", hint: "Клиенты" },
  { title: "Все люди", href: "/clients?mode=people", hint: "Клиенты" },
  { title: "Компании", href: "/clients?mode=companies", hint: "Клиенты" },
  { title: "Заказы, требующие действия", href: "/orders?filter=action", hint: "Заказы" },
  { title: "Доска производства", href: "/orders/production", hint: "Заказы" },
  { title: "Товары без цены", href: "/catalog?filter=missing_price", hint: "Товары" },
  { title: "Товары без фото", href: "/catalog?filter=missing_media", hint: "Товары" },
  { title: "Комнаты", href: "/rooms", hint: "Товары" },
  { title: "Карточка на витрине", href: "/promo", hint: "Витрина" },
]
