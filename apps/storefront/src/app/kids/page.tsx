import type { Metadata } from "next"
import Link from "next/link"
import { kidsHome, seo } from "@/lib/woodright-copy"
import { CopyLines } from "@/components/copy-lines"

export const metadata: Metadata = {
  title: seo.kids.title,
  description: seo.kids.description,
  openGraph: {
    title: seo.kids.title,
    description: seo.kids.description,
    url: "/kids",
  },
}

export default function KidsPage() {
  return (
    <div className="hero">
      <h1>{kidsHome.h1}</h1>
      <CopyLines lines={kidsHome.lead} />
      <CopyLines className="hero-note" lines={kidsHome.supporting} />
      <div className="hero-actions">
        <Link href="/kids/catalog" className="btn btn-primary">
          {kidsHome.ctaCatalog}
        </Link>
        <Link href="/kids/rooms" className="btn btn-secondary">
          {kidsHome.ctaRooms}
        </Link>
        <Link href="/bespoke/request" className="btn btn-secondary">
          {kidsHome.ctaBespoke}
        </Link>
      </div>
    </div>
  )
}
