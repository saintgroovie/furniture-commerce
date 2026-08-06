/**
 * Bare production hostnames for classification only.
 *
 * Never construct scheme-qualified production origins (`https://` + host) in
 * shippable storefront modules - bundlers fold joins/templates into contiguous
 * literals that fail public_demo artifact contamination gates
 * (run 31082069745 / chunk 5052.js).
 *
 * Production origins must come from explicit profile env
 * (`NEXT_PUBLIC_SITE_URL` / API URL), validated against these hosts.
 */

export const PRODUCTION_BUYER_HOSTS = ["woodright.ru", "www.woodright.ru"] as const

export const PRODUCTION_SITE_APEX_HOST = "woodright.ru" as const

export const PRODUCTION_API_HOST = "api.woodright.ru" as const

export function isProductionBuyerHost(hostname: string): boolean {
  const h = hostname.toLowerCase()
  return (PRODUCTION_BUYER_HOSTS as readonly string[]).includes(h)
}

export function isProductionApiHost(hostname: string): boolean {
  return hostname.toLowerCase() === PRODUCTION_API_HOST
}

export function isProductionSiteApexHost(hostname: string): boolean {
  return hostname.toLowerCase() === PRODUCTION_SITE_APEX_HOST
}
