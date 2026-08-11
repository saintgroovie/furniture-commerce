import type { Metadata } from "next"

export const metadata: Metadata = {
  title: { default: "По проекту", template: "%s | По проекту | Woodright" },
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
