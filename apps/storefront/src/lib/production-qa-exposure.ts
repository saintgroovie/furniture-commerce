import { isProductionBuyerHost } from "./production-hosts"

/** Operator boards must not be reachable on the public production host. */
export function isProductionQaPathBlocked(input: {
  pathname: string
  host: string | null
  runtimeRole?: string | null
}): boolean {
  const path = input.pathname
  const isQa = path === "/qa" || path.startsWith("/qa/")
  if (!isQa) return false
  const host = (input.host || "").split(":")[0].toLowerCase()
  if (host && isProductionBuyerHost(host)) return true
  return (input.runtimeRole || "").trim() === "public_production"
}
