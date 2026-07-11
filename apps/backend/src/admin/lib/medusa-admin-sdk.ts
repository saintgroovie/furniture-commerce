/**
 * Local identity helpers matching `@medusajs/admin-sdk` public contract.
 * Package B must not add/upgrade dependencies; admin-sdk is not in package.json.
 */
export type WoodrightWidgetConfig = {
  zone: string | string[]
  id?: string
}

export type WoodrightRouteConfig = {
  label?: string
  icon?: unknown
  /** Must be a NestedRoutePosition from @medusajs/admin-shared when used */
  nested?: "/orders" | "/products" | "/inventory" | "/customers" | "/promotions" | "/price-lists"
  rank?: number
  translationNs?: string
}

export function defineWidgetConfig<T extends WoodrightWidgetConfig>(config: T): T {
  return config
}

export function defineRouteConfig<T extends WoodrightRouteConfig>(config: T): T {
  return config
}
