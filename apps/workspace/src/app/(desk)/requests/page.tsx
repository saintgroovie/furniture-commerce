import { redirect } from "next/navigation"
import { LEGACY_REDIRECTS } from "@/lib/nav"

export default function RequestsLegacyPage() {
  redirect(LEGACY_REDIRECTS["/requests"]!)
}
