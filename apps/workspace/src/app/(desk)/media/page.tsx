import { redirect } from "next/navigation"
import { LEGACY_REDIRECTS } from "@/lib/nav"

export default function MediaLegacyPage() {
  redirect(LEGACY_REDIRECTS["/media"]!)
}
