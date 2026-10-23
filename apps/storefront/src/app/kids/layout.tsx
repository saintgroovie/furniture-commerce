import type { Metadata } from "next"

export const metadata: Metadata = {
  title: { default: "Детская", template: "%s | Детская | Woodright" },
  description:
    "Мебель из массива для сна, игр и первых открытий. Oliver Kids и росписи Вилли Винки.",
}

// The section subnav bar was removed: the main header's "Детская" dropdown
// already covers the same links (Каталог / Комнаты / О разделе), so it was
// a redundant duplicate row on every /kids/* page.
export default function KidsLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return <div className="kids-theme">{children}</div>
}
