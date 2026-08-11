/**
 * Guard: catalog search placeholder stays readable on mobile (≤360px).
 *
 *   yarn exec tsx src/lib/catalog-search-placeholder.fidelity.test.ts
 */
import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"
import { catalogUiCopy } from "./woodright-copy"

const root = join(dirname(fileURLToPath(import.meta.url)), "../..")

function read(rel: string): string {
  return readFileSync(join(root, rel), "utf8")
}

assert.equal(
  catalogUiCopy.searchPlaceholder,
  "Поиск по названию, коллекции или категории"
)
assert.equal(
  catalogUiCopy.searchPlaceholderCompact,
  "Название, коллекция или категория"
)
assert.ok(
  catalogUiCopy.searchPlaceholderCompact.length <
    catalogUiCopy.searchPlaceholder.length
)
for (const token of ["Название", "коллекция", "категория"] as const) {
  assert.match(catalogUiCopy.searchPlaceholderCompact, new RegExp(token, "i"))
}
assert.doesNotMatch(catalogUiCopy.searchPlaceholderCompact, /\.\.\.|…/)
assert.doesNotMatch(catalogUiCopy.searchPlaceholder, /\.\.\.|…/)

const filters = read("src/components/catalog-filter-controls.tsx")
assert.match(filters, /catalogUiCopy/)
assert.match(filters, /searchPlaceholderCompact/)
assert.match(filters, /BUYER_MOBILE_MQ/)
assert.match(filters, /useSyncExternalStore/)
assert.match(filters, /subscribeBuyerMobileMq/)
assert.match(filters, /catalogUiCopy\.searchLabel/)
assert.match(filters, /catalogUiCopy\.searchClear/)
assert.match(filters, /catalogUiCopy\.searchSubmit/)

const globals = read("src/app/globals.css")
assert.match(
  globals,
  /\.catalog-search-input-wrap:not\(:has\(\.catalog-search-clear\)\)/
)
assert.match(globals, /padding-right:\s*12px/)

console.log("catalog-search-placeholder.fidelity.test.ts: ok")
