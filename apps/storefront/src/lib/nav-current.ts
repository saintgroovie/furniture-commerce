/** True when a primary nav href should show as the current section. */
export function isPrimaryNavCurrent(pathname: string, href: string): boolean {
  if (!pathname || !href || href === "/") return pathname === href
  return pathname === href || pathname.startsWith(`${href}/`)
}
