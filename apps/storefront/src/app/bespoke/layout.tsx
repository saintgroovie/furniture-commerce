import type { Metadata } from "next"

export const metadata: Metadata = {
  title: { default: "Woodright Bespoke", template: "%s | Woodright Bespoke" },
  description:
    "Мебель по проекту Woodright: подбор мебели, отделок и состава комнаты под интерьер или индивидуальную задачу.",
}

export default function BespokeLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return <div className="bespoke-theme">{children}</div>
}
