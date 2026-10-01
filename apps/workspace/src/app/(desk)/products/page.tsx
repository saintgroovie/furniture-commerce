import { redirect } from "next/navigation"
import { LEGACY_REDIRECTS } from "@/lib/nav"

export default function ProductsAliasPage() {
  redirect(LEGACY_REDIRECTS["/products"]!)
}
