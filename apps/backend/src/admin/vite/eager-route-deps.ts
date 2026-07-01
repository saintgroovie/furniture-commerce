import fs from "node:fs"
import path from "node:path"

/**
 * Root cause (2026-07-01): Medusa Admin code-splits every route of
 * `@medusajs/dashboard` into its own pre-built `dist/<route>-<hash>.mjs` chunk.
 * Vite's dependency optimizer only crawls deps reachable from `index.html` at
 * cold start — lazily `import()`-ed route chunks (e.g. category-list,
 * collection-list, their `*-metadata` editors and transitive npm deps like the
 * JSON/Prism syntax highlighter) are only discovered the *first time* a route
 * is visited in a dev session. That discovery triggers a **mid-session**
 * re-optimize pass, which needs Vite's HMR websocket to tell the browser
 * "reload once ready" (`server.hot.send({ type: "full-reload" })`).
 *
 * Because admin Vite HMR is intentionally disabled for stability
 * (`disable-hmr-plugin.ts`), that reload signal never reaches the browser, and
 * we've observed the optimizer rerun itself can stall indefinitely (orphaned
 * `deps_temp_*` directory, never renamed to `deps`, every later request for
 * ANY chunk gets `504 Outdated Optimize Dep` until the dev server is
 * restarted). This reproduced reliably on first navigation to **Categories**
 * and **Collections** (routes that are not reachable from the default
 * dashboard landing page, so they're never part of the cold-start crawl).
 *
 * Fix: force Vite's *cold-start* optimize pass to additionally bundle the
 * Categories/Collections route chunks (and their sub-routes: create/edit/
 * detail/organize/metadata/add-products) via `optimizeDeps.include`. This
 * makes the one-time, working cold-start pass discover the same transitive
 * deps that would otherwise only be found later — so the fragile mid-session
 * re-optimize path is never triggered for these routes.
 *
 * Scope note: we deliberately only cover categories/collections (~13 chunks),
 * not all ~380 dashboard route chunks. Measured with `DEBUG=vite:deps`:
 * eagerly including *every* dashboard chunk makes cold start's post-esbuild
 * metadata/hash/rename bookkeeping take ~100s of silent (no file I/O) main-
 * thread work — which is itself a stability risk (a restart landing in that
 * window looks indistinguishable from a genuinely stuck/orphaned temp dir).
 * A ~13-chunk include keeps cold start fast (~15s total, matching the
 * pre-incident baseline) while still fixing the exact routes that were
 * reported broken. If other routes exhibit the same issue, widen the
 * `ROUTE_CHUNK_PREFIXES` list rather than switching back to "all chunks".
 *
 * IMPORTANT: this must use `optimizeDeps.include` (module specifiers), NOT
 * `optimizeDeps.entries` (glob patterns). Vite's own `globEntries()` always
 * adds `ignore: ["**\/node_modules/**"]` to any dynamic-pattern glob search
 * (see vite's `dep-*.js` `globEntries`) — so a glob like
 * `node_modules/@medusajs/dashboard/dist/*.mjs` passed via `entries` silently
 * matches **zero** files, no matter how it's written.
 *
 * It ALSO can't be a bare specifier like `@medusajs/dashboard/dist/<file>.mjs`:
 * that package's `package.json` `exports` map only exposes `.`, `./css`,
 * `./root` and `./package.json` — no wildcard `./dist/*` entry — so Node's
 * (and Vite's `include` resolver, which honors `exports`) subpath resolution
 * throws `ERR_PACKAGE_PATH_NOT_EXPORTED`/"Missing specifier" for every chunk.
 *
 * What *does* work: Vite's `include` resolver falls back to plain filesystem
 * resolution for absolute paths (it only consults `exports` for bare
 * specifiers). So we pass the chunks' real absolute paths on disk. We still
 * avoid hardcoding any content-hashed filename in source — the chunk list is
 * read from disk at config-load time and matched by *prefix*, so this keeps
 * working across `@medusajs/dashboard` version bumps that rename chunks
 * (the content hash suffix changes, the `category-list-` prefix doesn't).
 */
const ROUTE_CHUNK_PREFIXES = [
  "category-",
  "categories-",
  "collection-",
]

export function woodrightAdminEagerRouteDepsChunks(cwd: string): string[] {
  const dashboardDist = path.join(cwd, "node_modules/@medusajs/dashboard/dist")
  let files: string[]
  try {
    files = fs.readdirSync(dashboardDist)
  } catch {
    return []
  }
  return files
    .filter(
      (name) =>
        name.endsWith(".mjs") &&
        ROUTE_CHUNK_PREFIXES.some((prefix) => name.startsWith(prefix))
    )
    .map((name) => path.join(dashboardDist, name))
}
