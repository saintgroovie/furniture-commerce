import { finalizeOrPruneViteCache } from "./finalize-vite-cache.mjs"

type VitePlugin = {
  name: string
  configureServer?: () => void
}

export { finalizeOrPruneViteCache }

let pruneRanForCacheDir: string | null = null

/**
 * Vite иногда оставляет deps_temp_* без rename в deps/ (прерванный optimize-deps).
 * Браузер запрашивает /deps/*.js → 404. Финализируем или чистим сироты **один раз**
 * за процесс Vite — повторный prune при restart/HMR ломает уже загруженные chunk hash.
 */
export function woodrightPruneViteCachePlugin(cacheDir: string): VitePlugin {
  return {
    name: "woodright-prune-vite-cache",
    configureServer() {
      if (pruneRanForCacheDir === cacheDir) {
        return
      }
      pruneRanForCacheDir = cacheDir
      finalizeOrPruneViteCache(cacheDir)
    },
  }
}
