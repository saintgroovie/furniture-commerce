import { redirect } from "next/navigation"
import { LEGACY_REDIRECTS } from "@/lib/nav"

export default function SiteLegacyPage() {
  redirect(LEGACY_REDIRECTS["/site"]!)
}
