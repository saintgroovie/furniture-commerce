export type SiteSection = "main" | "kids" | "bespoke"

export function isKidsPath(pathname: string): boolean {
  return pathname === "/kids" || pathname.startsWith("/kids/")
}

export function isBespokePath(pathname: string): boolean {
  return pathname === "/bespoke" || pathname.startsWith("/bespoke/")
}

export function isProductPath(pathname: string): boolean {
  return pathname === "/product" || pathname.startsWith("/product/")
}

export function sectionFromPath(pathname: string): SiteSection {
  if (isKidsPath(pathname)) return "kids"
  if (isBespokePath(pathname)) return "bespoke"
  return "main"
}
