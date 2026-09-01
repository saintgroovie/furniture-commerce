/**
 * Buyer-facing Bespoke terminology: nav «По проекту», page brand Woodright Bespoke.
 *
 *   yarn exec tsx src/lib/bespoke-terminology.fidelity.test.ts
 */
import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"
import { bespokeLanding, footer, nav, seo } from "./woodright-copy"
import { isPrimaryNavCurrent } from "./nav-current"

const root = join(dirname(fileURLToPath(import.meta.url)), "../..")
function read(rel: string): string {
  return readFileSync(join(root, rel), "utf8")
}

assert.equal(nav.bespoke, "По проекту")
assert.notEqual(nav.bespoke, "Bespoke")
assert.equal(bespokeLanding.h1, "Woodright Bespoke")
assert.notEqual(bespokeLanding.h1, "По проекту")
assert.equal(bespokeLanding.ctaPrimary, "Обсудить проект")
assert.equal(bespokeLanding.ctaSecondary, "Дизайнерам")

const lead0 = bespokeLanding.lead[0]
assert.match(lead0, /Bespoke/)
assert.match(lead0, /индивидуальному проекту/)
assert.match(lead0, /мебельного ателье/)
assert.match(lead0, /мастерской на заказ/)
assert.doesNotMatch(lead0, /Bespoke, мебельное ателье/)
assert.doesNotMatch(bespokeLanding.h1, /По проекту/)
assert.match(bespokeLanding.lead[1], /каталог и штатные варианты/)

assert.equal(seo.bespoke.title, "Woodright Bespoke")
assert.match(seo.bespoke.description, /индивидуальному проекту/)
assert.doesNotMatch(seo.bespoke.description, /bespoke, мебельное ателье/i)

assert.equal(
  footer.columns.find((col) => col.links.some((l) => l.href === "/bespoke"))?.title,
  "По проекту"
)
assert.ok(!footer.columns.some((col) => col.title === "Bespoke"))

const layout = read("src/app/layout.tsx")
assert.match(layout, /href="\/bespoke"\s*\n\s*label=\{navCopy\.bespoke\}/)
assert.doesNotMatch(layout, /label=\{?"Bespoke"?\}/)

const mobileNav = read("src/components/mobile-nav.tsx")
assert.match(mobileNav, /href: "\/bespoke", label: navCopy\.bespoke/)
assert.match(mobileNav, /aria-current/)

const hero = read("src/components/home/bespoke-hero.tsx")
assert.match(hero, /href="\/bespoke\/request"/)
assert.match(hero, /href="\/designers"/)
assert.match(hero, /bespokeLanding\.h1/)
assert.match(hero, /bespokeLanding\.ctaPrimary/)

const pageMeta = read("src/app/bespoke/page.tsx")
assert.match(pageMeta, /seo\.bespoke\.title/)
assert.match(pageMeta, /seo\.bespoke\.description/)

const routeLayout = read("src/app/bespoke/layout.tsx")
assert.match(routeLayout, /seo\.bespoke\.title/)
assert.doesNotMatch(routeLayout, /default:\s*"По проекту"/)

const catalogCta = read("src/components/catalog-filter-controls.tsx")
assert.match(catalogCta, /href="\/bespoke"/)
assert.match(catalogCta, /navCopy\.bespoke/)
assert.doesNotMatch(catalogCta, />\s*Bespoke\s*</)

const loading = read("src/app/loading.tsx")
assert.match(loading, /systemCopy\.loading\.label/)
assert.doesNotMatch(loading, /По проекту/)

assert.equal(isPrimaryNavCurrent("/bespoke", "/bespoke"), true)
assert.equal(isPrimaryNavCurrent("/bespoke/request", "/bespoke"), true)
assert.equal(isPrimaryNavCurrent("/catalog", "/bespoke"), false)
assert.equal(isPrimaryNavCurrent("/kids/catalog", "/catalog"), false)
assert.equal(isPrimaryNavCurrent("/designers", "/bespoke"), false)

const navDropdown = read("src/components/nav-dropdown.tsx")
assert.match(navDropdown, /aria-current=\{current \? "page" : undefined\}/)

console.log("bespoke-terminology.fidelity: ok")
