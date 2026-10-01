import { redirect } from "next/navigation"
import { LEGACY_REDIRECTS } from "@/lib/nav"

export default function PeopleLegacyPage() {
  redirect(LEGACY_REDIRECTS["/people"]!)
}
