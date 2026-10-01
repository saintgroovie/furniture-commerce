import { redirect } from "next/navigation"
import { LEGACY_REDIRECTS } from "@/lib/nav"

export default function StorefrontAliasPage() {
  redirect(LEGACY_REDIRECTS["/storefront"]!)
}
