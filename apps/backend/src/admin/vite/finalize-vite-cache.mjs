import fs from "node:fs"
import path from "node:path"

const GLOBAL_GUARD_KEY = "__woodrightViteCacheFinalizedDirs"

// A live esbuild optimize-deps run writes its output files quickly, then can
// spend a long stretch doing silent (no file I/O) bookkeeping — hashing,
// interop-mismatch checks, static-imports crawl — before the final metadata
// write + rename (measured 44s end-to-end for the scoped categories/
// collections `optimizeDeps.include`, up to ~100s for a much larger one; see
// `eager-route-deps.ts`). Anything touched more recently than this grace
// window is treated as "still being written by a live process" and must not
// be renamed/deleted, no matter what triggered this call. Generous on
// purpose: the cost of leaving a genuinely dead orphan for longer is low,
// the cost of killing live work mid-flight is a full "Failed to fetch
// dynamically imported module" incident.
const LIVE_TEMP_DIR_GRACE_MS = 90_000

function mostRecentMtimeMs(dir) {
  let latest = 0
  let entries
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true })
  } catch {
    return latest
  }
  // Sampling is enough: we only need "was ANYTHING touched recently".
  for (const entry of entries.slice(0, 25)) {
    try {
      const stat = fs.statSync(path.join(dir, entry.name))
      if (stat.mtimeMs > latest) latest = stat.mtimeMs
    } catch {
      // entry may have been removed concurrently by the live writer — ignore
    }
  }
  return latest
}

function isLikelyLive(tempDirPath) {
  let dirStat
  try {
    dirStat = fs.statSync(tempDirPath)
  } catch {
    return false
  }
  const newest = Math.max(dirStat.mtimeMs, mostRecentMtimeMs(tempDirPath))
  return Date.now() - newest < LIVE_TEMP_DIR_GRACE_MS
}

/**
 * Vite иногда оставляет deps_temp_* без rename в deps/ (прерванный optimize-deps).
 * Браузер запрашивает /deps/*.js → 404. Финализируем или чистим сироты до старта Vite.
 *
 * Идемпотентность через `globalThis` (не module-local переменную!): `medusa-config.ts`
 * вызывает эту функцию на верхнем уровне модуля, а backend HMR (`MEDUSA_FF_BACKEND_HMR`)
 * может повторно ИМПОРТИРОВАТЬ этот модуль как новый instance при каждом restart —
 * module-local guard в этом случае каждый раз обнуляется и не защищает. Без guard на
 * `globalThis` повторный вызов на каждый backend restart удаляет/трогает живой,
 * ещё используемый Vite cache (deps_temp_* от активной optimize-deps), что ломает уже
 * отданные браузеру chunk'и (hash mismatch → "Failed to fetch dynamically imported module"
 * → клиентский auto-reload loop). См. `stale-chunk-reload-plugin.ts` для второй половины
 * этого инцидента.
 *
 * 2026-07-01: `globalThis` only protects re-entrancy *within one JS realm*. Medusa's
 * "standard dev server (restart on file change)" watcher restarts the framework without
 * changing the outer OS pid (confirmed empirically) — this can re-run this module in a
 * fresh realm (e.g. a new worker/VM context) whose `globalThis` guard has never fired,
 * while a *different*, still-alive Vite optimize-deps pass from the previous realm is
 * mid-write into `deps_temp_*` on disk. The old code treated ANY existing `deps_temp_*`
 * as an "orphan" and deleted/renamed it unconditionally — including one that's actively
 * growing right now — which silently kills a live, almost-finished optimization and is
 * what caused Categories/Collections to hang on `504 Outdated Optimize Dep` even after
 * the `optimizeDeps.entries` eager-crawl fix (see `eager-route-deps.ts`) was in place.
 * Filesystem mtime is the only cross-realm-safe signal we have, so: skip anything
 * modified within `LIVE_TEMP_DIR_GRACE_MS` — only prune what's truly abandoned.
 */
export function finalizeOrPruneViteCache(cacheDir) {
  const finalizedDirs = (globalThis[GLOBAL_GUARD_KEY] ??= new Set())
  if (finalizedDirs.has(cacheDir)) {
    return
  }
  finalizedDirs.add(cacheDir)

  if (!fs.existsSync(cacheDir)) {
    return
  }

  // macOS duplicate folders like "deps 2" after interrupted copies — confuse optimize-deps.
  for (const entry of fs.readdirSync(cacheDir)) {
    if (entry.startsWith("deps") && entry !== "deps" && !entry.startsWith("deps_temp_")) {
      fs.rmSync(path.join(cacheDir, entry), { recursive: true, force: true })
    }
  }

  const allTemps = fs
    .readdirSync(cacheDir)
    .filter((entry) => entry.startsWith("deps_temp_"))
  const temps = allTemps.filter(
    (entry) => !isLikelyLive(path.join(cacheDir, entry))
  )
  const depsDir = path.join(cacheDir, "deps")

  if (fs.existsSync(depsDir)) {
    for (const entry of temps) {
      fs.rmSync(path.join(cacheDir, entry), { recursive: true, force: true })
    }
    return
  }

  if (temps.length === 1) {
    const src = path.join(cacheDir, temps[0])
    try {
      fs.renameSync(src, depsDir)
    } catch {
      // Vite пересоберёт при следующем запросе
    }
    return
  }

  if (temps.length > 1) {
    for (const entry of temps) {
      fs.rmSync(path.join(cacheDir, entry), { recursive: true, force: true })
    }
  }
}

export function adminViteCacheDir(cwd, backendPort, adminVitePort) {
  return path.join(cwd, ".medusa", `vite-${backendPort}-${adminVitePort}`)
}
