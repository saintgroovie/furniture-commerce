"use client"

import { useEffect, useTransition } from "react"
import { usePathname, useRouter } from "next/navigation"
import { subscribeCatalogFreshness } from "@/lib/catalog-freshness-events"

/** Re-read prices/media when returning from the editor or a restored browser page. */
export function CatalogFreshness() {
  const pathname = usePathname()
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const enabled = pathname === "/catalog" || pathname === "/kids/catalog" ||
    pathname.startsWith("/product/") || pathname.startsWith("/kids/willie-winkie")

  useEffect(() => {
    if (!enabled || pending) return
    return subscribeCatalogFreshness({
      windowTarget: window,
      documentTarget: document,
      isVisible: () => document.visibilityState === "visible",
      refresh: () => startTransition(() => router.refresh()),
    })
  }, [enabled, pathname, pending, router])
  return null
}
