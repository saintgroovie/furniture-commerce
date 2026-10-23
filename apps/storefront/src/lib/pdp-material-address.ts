/** Address sync for the PDP material dropdown.

The dropdown used to publish the pick only in memory. SSR already reads
`material` through materialOptionsForUrl, so a reload follows the URL and
drops a pick that never reached it. This module only rewrites that one
query. It keeps variant, finish and every other parameter, and it refuses
a code that is not one of the options on the current variant.
*/

export type MaterialAddressCommit = {
  href: string
  push: boolean
  code: string
}

export function materialAddressCommit(input: {
  href: string
  nextCode: string
  currentCode: string
  allowedCodes: readonly string[]
}): MaterialAddressCommit {
  const { href, nextCode, currentCode, allowedCodes } = input
  if (!allowedCodes.includes(nextCode)) {
    return { href, push: false, code: currentCode }
  }
  const url = new URL(href, "http://127.0.0.1")
  url.searchParams.set("material", nextCode)
  const nextHref = `${url.pathname}${url.search}${url.hash}`
  if (nextHref === href) return { href, push: false, code: nextCode }
  return { href: nextHref, push: true, code: nextCode }
}

/** Known code from the query, otherwise the current variant's own fallback. */
export function materialCodeFromSearch(
  search: string,
  allowedCodes: readonly string[],
  fallback: string
): string {
  const params = new URLSearchParams(search.startsWith("?") ? search.slice(1) : search)
  const code = params.get("material")
  if (code && allowedCodes.includes(code)) return code
  return allowedCodes.includes(fallback) ? fallback : (allowedCodes[0] ?? fallback)
}
