#!/usr/bin/env node
/**
 * Финализирует deps_temp_* → deps/ до старта medusa develop.
 */
import path from "node:path"
import { fileURLToPath } from "node:url"
import {
  adminViteCacheDir,
  finalizeOrPruneViteCache,
} from "../src/admin/vite/finalize-vite-cache.mjs"

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..")
const backendPort = Number(process.env.PORT ?? 9000)
const adminVitePort = Number(process.env.ADMIN_VITE_PORT ?? 5173)
const cacheDir = adminViteCacheDir(root, backendPort, adminVitePort)

finalizeOrPruneViteCache(cacheDir)
console.log(`admin vite cache: finalized (${cacheDir})`)
