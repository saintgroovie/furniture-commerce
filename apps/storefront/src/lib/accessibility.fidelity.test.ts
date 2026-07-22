/**
 * Guard: buyer accessibility contracts (skip link, focus-visible, dialog patterns).
 *
 *   yarn exec tsx src/lib/accessibility.fidelity.test.ts
 */
import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"

const root = join(dirname(fileURLToPath(import.meta.url)), "../..")

function read(rel: string): string {
  return readFileSync(join(root, rel), "utf8")
}

const layout = read("src/app/layout.tsx")
assert.match(layout, /skip-link/)
assert.match(layout, /#main-content/)
assert.match(layout, /a11yCopy\.skipToContent/)
assert.match(layout, /id="main-content"/)
assert.match(layout, /lang="ru"/)

const globals = read("src/app/globals.css")
assert.match(globals, /\.skip-link:focus/)
assert.match(globals, /a:focus-visible/)
assert.match(globals, /button:focus-visible/)
assert.match(globals, /prefers-reduced-motion:\s*reduce/)
assert.match(globals, /\.catalog-search:focus-within/)
assert.match(globals, /\.catalog-filter-price input:focus-visible/)
assert.doesNotMatch(
  globals,
  /\.catalog-filter-price input:focus-visible\s*\{\s*outline:\s*none/
)

const mobileNav = read("src/components/mobile-nav.tsx")
assert.match(mobileNav, /role:\s*"dialog"/)
assert.match(mobileNav, /aria-modal/)
assert.match(mobileNav, /setAttribute\("inert"/)
assert.match(mobileNav, /Escape/)
assert.match(mobileNav, /aria-controls/)
assert.match(mobileNav, /aria-expanded/)
assert.doesNotMatch(mobileNav, /role=["']application["']/)

const filters = read("src/components/catalog-filter-controls.tsx")
assert.match(filters, /CATALOG_FILTER_SIDEBAR_ID/)
assert.match(filters, /aria-controls=\{CATALOG_FILTER_SIDEBAR_ID\}/)
assert.match(filters, /role="group"/)
assert.match(filters, /a11yCopy\.activeFiltersLabel/)
assert.match(filters, /Escape/)
assert.match(filters, /filterToggleRef/)

const navDropdown = read("src/components/nav-dropdown.tsx")
assert.match(navDropdown, /aria-expanded/)
assert.match(navDropdown, /aria-controls/)
assert.match(navDropdown, /role="region"/)
assert.match(navDropdown, /Escape/)

const lightbox = read("src/components/pdp-image-lightbox.tsx")
assert.match(lightbox, /role="dialog"/)
assert.match(lightbox, /aria-modal/)
assert.match(lightbox, /Escape/)

const copy = read("src/lib/woodright-copy.ts")
assert.match(copy, /skipToContent/)
assert.match(copy, /openFilters/)
assert.match(copy, /closeFilters/)
assert.match(copy, /mobileNavLabel/)

// SEO noindex contract must remain intact.
const indexing = read("src/lib/indexing-policy.ts")
assert.match(indexing, /noindex/)
assert.match(indexing, /fail-closed|noindex/)

console.log("accessibility.fidelity: ok")
