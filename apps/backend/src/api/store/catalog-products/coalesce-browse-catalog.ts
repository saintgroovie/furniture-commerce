/**
 * In-flight dedupe for the public full browse catalog.
 *
 * Safe to share across callers because the unfiltered browse response is not
 * user-specific: publication filter is global, and calculated prices use the
 * single store region, not a customer session. Filtered or handle-scoped
 * requests are not coalesced. A rejection is not cached: the slot is cleared
 * when the promise settles.
 */

const inflight = new Map<string, Promise<unknown>>()

function filterSupplied(value: unknown): boolean {
  // Any present value, including whitespace, empty string, arrays, and
  // non-strings. The loader applies the raw query. Trimming here would let
  // `category_id=%20` share the unfiltered result.
  return value != null
}

export function browseCatalogCoalesceKey(
  query: Record<string, unknown> | undefined
): string | null {
  const q = query ?? {}
  if (
    filterSupplied(q.product_type) ||
    filterSupplied(q.category_id) ||
    filterSupplied(q.handle)
  ) {
    return null
  }
  return "browse:published:full"
}

export function coalesceBrowseCatalog<T>(
  key: string | null,
  build: () => Promise<T>
): Promise<T> {
  if (!key) return build()
  const existing = inflight.get(key) as Promise<T> | undefined
  if (existing) return existing
  const promise = build()
  inflight.set(key, promise)
  // Mark the shared rejection handled so a failed build does not surface
  // as an unhandled rejection after callers have already observed it.
  void promise.then(
    () => {
      if (inflight.get(key) === promise) inflight.delete(key)
    },
    () => {
      if (inflight.get(key) === promise) inflight.delete(key)
    }
  )
  return promise
}

/** Test-only: the map must be empty between cases. */
export function resetBrowseCatalogCoalesceForTests(): void {
  inflight.clear()
}
