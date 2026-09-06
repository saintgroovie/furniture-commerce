import { permanentRedirect } from "next/navigation"
import { designersLandingCopy } from "@/lib/woodright-copy"

export default function DesignersRequestPage() {
  permanentRedirect(designersLandingCopy.ctaHref)
}
