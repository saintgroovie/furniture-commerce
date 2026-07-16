import { redirect } from "next/navigation"

/**
 * Willie Winkie is a kids collection filter, not a standalone marketing page
 * in this release SHA. Keep the historical path working for bookmarks/links.
 */
export default function KidsWillieWinkieRedirectPage() {
  redirect("/kids/catalog")
}
