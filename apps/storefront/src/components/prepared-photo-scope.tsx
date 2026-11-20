"use client"

import { createContext, useCallback, useContext, Suspense, type ReactNode } from "react"
import { usePathname, useSearchParams } from "next/navigation"
import { resolvePreparedPhotoURL, preparedPdpScopeForRoute, type PreparedPhotoScope } from "@/lib/prepared-photos"

const Scope = createContext<PreparedPhotoScope | null>(null)
export function PreparedPhotoProvider({ scope, children }: { scope: PreparedPhotoScope | null; children: ReactNode }) {
  return <Scope.Provider value={scope}>{children}</Scope.Provider>
}
function PreparedPdpPhotoProviderInner({ scope, routeKey, urlVariantAtRender, children }: {
  scope: PreparedPhotoScope | null; routeKey: string; urlVariantAtRender: string | null; children: ReactNode
}) {
  const pathname = usePathname(), search = useSearchParams()
  let actual = ""
  try { actual = decodeURIComponent(pathname.replace(/^\/product\//, "").replace(/\/$/, "")) } catch { /* No prepared override on malformed/stale route. */ }
  const current = preparedPdpScopeForRoute(scope, routeKey, urlVariantAtRender, actual, search.get("variant"))
  return <PreparedPhotoProvider scope={current}>{children}</PreparedPhotoProvider>
}
export function PreparedPdpPhotoProvider(props: {
  scope: PreparedPhotoScope | null; routeKey: string; urlVariantAtRender: string | null; children: ReactNode
}) {
  if (!props.scope) return <>{props.children}</>
  return <Suspense fallback={props.children}><PreparedPdpPhotoProviderInner {...props} /></Suspense>
}
export function usePreparedPhotoResolver(): (url: string, knownOriginal?: string) => string {
  const scope = useContext(Scope)
  return useCallback((url: string, knownOriginal?: string) => resolvePreparedPhotoURL(scope, url, knownOriginal), [scope])
}
