import type { Metadata } from "next"
import { seo } from "@/lib/woodright-copy"

export const metadata: Metadata = {
  title: seo.bespoke.title,
  description: seo.bespoke.description,
}

export default function BespokeLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return <div className="bespoke-theme">{children}</div>
}
