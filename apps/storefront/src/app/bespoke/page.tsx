import type { Metadata } from "next"
import { seo } from "@/lib/woodright-copy"
import { BespokeHero } from "@/components/home/bespoke-hero"
import { BespokeWhen } from "@/components/home/bespoke-when"
import { BespokeProcess } from "@/components/home/bespoke-process"
import { BespokeFinal } from "@/components/home/bespoke-final"
import { HomeRevealObserver } from "@/components/home/home-reveal-observer"

export const metadata: Metadata = {
  title: seo.bespoke.title,
  description: seo.bespoke.description,
  openGraph: {
    title: seo.bespoke.title,
    description: seo.bespoke.description,
    url: "/bespoke",
  },
}

export default function BespokePage() {
  return (
    <div className="hp hp--bespoke">
      <HomeRevealObserver />
      <BespokeHero />
      <BespokeWhen />
      <BespokeProcess />
      <BespokeFinal />
    </div>
  )
}
