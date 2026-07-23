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

const dialogLib = read("src/lib/buyer-dialog-a11y.ts")
assert.match(dialogLib, /setBuyerChromeInert/)
assert.match(dialogLib, /handleDialogKeydown/)
assert.match(dialogLib, /listFocusable/)
assert.match(dialogLib, /header \.header-top/)
assert.match(dialogLib, /header \.header-main/)
assert.match(dialogLib, /BUYER_DIALOG_LAYER/)
assert.match(dialogLib, /activeLayers/)
assert.match(dialogLib, /recomputeBuyerChromeInert|appliedInert/)
assert.match(dialogLib, /BUYER_CLOSE_PEER_EVENT/)
assert.match(dialogLib, /requestCloseBuyerDialogPeer/)
assert.match(dialogLib, /BUYER_MOBILE_MQ/)
assert.match(dialogLib, /Escape/)
assert.match(dialogLib, /Tab/)

const mobileNav = read("src/components/mobile-nav.tsx")
assert.match(mobileNav, /role:\s*"dialog"/)
assert.match(mobileNav, /aria-modal/)
assert.match(mobileNav, /setBuyerChromeInert|setMobileNavBackgroundInert/)
assert.match(mobileNav, /BUYER_DIALOG_LAYER\.mobileNav|LAYER/)
assert.match(mobileNav, /requestCloseBuyerDialogPeer/)
assert.match(mobileNav, /BUYER_CLOSE_PEER_EVENT/)
assert.match(mobileNav, /BUYER_MOBILE_MQ/)
assert.match(mobileNav, /matchMedia/)
assert.match(mobileNav, /handleDialogKeydown/)
assert.match(mobileNav, /listFocusable/)
assert.match(mobileNav, /main-content/)
assert.match(mobileNav, /aria-controls/)
assert.match(mobileNav, /aria-expanded/)
assert.doesNotMatch(mobileNav, /role=["']application["']/)

const filters = read("src/components/catalog-filter-controls.tsx")
assert.match(filters, /CATALOG_FILTER_SIDEBAR_ID/)
assert.match(filters, /aria-controls=\{CATALOG_FILTER_SIDEBAR_ID\}/)
assert.match(filters, /role:\s*"dialog"/)
assert.match(filters, /aria-modal/)
assert.match(filters, /setBuyerChromeInert/)
assert.match(filters, /BUYER_DIALOG_LAYER\.catalogFilters/)
assert.match(filters, /requestCloseBuyerDialogPeer/)
assert.match(filters, /BUYER_CLOSE_PEER_EVENT/)
assert.match(filters, /BUYER_MOBILE_MQ/)
assert.match(filters, /matchMedia/)
assert.match(filters, /handleDialogKeydown/)
assert.match(filters, /listFocusable/)
assert.match(filters, /catalog-product-area/)
assert.match(filters, /closeMobileFilters/)
assert.match(filters, /role="group"/)
assert.match(filters, /a11yCopy\.activeFiltersLabel/)
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
assert.match(copy, /catalogFiltersLabel/)

// SEO noindex contract must remain intact.
const indexing = read("src/lib/indexing-policy.ts")
assert.match(indexing, /noindex/)
assert.match(indexing, /fail-closed|noindex/)

console.log("accessibility.fidelity: ok")
