/** One refresh for paired browser events; hidden tabs never request catalog data. */
export function subscribeCatalogFreshness(input: {
  windowTarget: EventTarget
  documentTarget: EventTarget
  isVisible: () => boolean
  refresh: () => void
  now?: () => number
}): () => void {
  const now = input.now ?? Date.now
  let lastRefresh = now()
  const refresh = () => {
    if (!input.isVisible() || now() - lastRefresh < 5_000) return
    lastRefresh = now()
    input.refresh()
  }
  const windowEvents = ["focus", "online", "pageshow", "popstate"]
  for (const event of windowEvents) input.windowTarget.addEventListener(event, refresh)
  input.documentTarget.addEventListener("visibilitychange", refresh)
  return () => {
    for (const event of windowEvents) input.windowTarget.removeEventListener(event, refresh)
    input.documentTarget.removeEventListener("visibilitychange", refresh)
  }
}
