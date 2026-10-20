import type { Metadata } from "next"
import { seo } from "@/lib/woodright-copy"
import { pageTitle } from "@/lib/page-title"
import { BespokeSubnav } from "@/components/bespoke/bespoke-subnav"

export const metadata: Metadata = {
  title: pageTitle(seo.bespoke.title),
  description: seo.bespoke.description,
}

/** Bespoke theme wrapper + sticky «По проекту» subnav on every /bespoke/* route. */
export default function BespokeLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <div className="bespoke-theme">
      <BespokeSubnav />
      {children}
    </div>
  )
}
