/**
 * Editorial content pages + partners IA.
 *
 *   yarn dlx tsx src/lib/editorial-pages.fidelity.test.ts
 */
import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"
import { footer, nav, partnersCopy } from "./woodright-copy"
import { collectStaticSitemapEntries } from "./sitemap-entries"
import { toStorefrontPartner } from "./api/partners"

const srcRoot = join(dirname(fileURLToPath(import.meta.url)), "..")
function read(relFromSrc: string): string {
  return readFileSync(join(srcRoot, relFromSrc), "utf8")
}

assert.equal(nav.partners, "Партнёры")
assert.equal(partnersCopy.h1, "Партнёры")

const woodrightCol = footer.columns.find((col) => col.title === "Woodright")
assert.ok(woodrightCol)
assert.deepEqual(
  woodrightCol.links.map((link) => link.href),
  [
    "/about",
    "/partners",
    "/designers",
    "/about/production",
    "/about/materials",
    "/contacts",
  ]
)

const layout = read("app/layout.tsx")
assert.match(layout, /href: "\/partners"/)
assert.match(read("components/mobile-nav.tsx"), /href: "\/partners"/)

for (const page of [
  "app/about/page.tsx",
  "app/about/materials/page.tsx",
  "app/about/production/page.tsx",
]) {
  const src = read(page)
  assert.match(src, /from "@\/components\/copy-lines"/)
  assert.match(src, /<CopyLines\b/)
  assert.match(src, /EditorialShell/)
}

const aboutCopySrc = read("lib/woodright-copy.ts")
assert.match(aboutCopySrc, /href: "\/partners"/)
assert.match(read("app/about/page.tsx"), /aboutCopy\.links/)

const partnersPage = read("app/partners/page.tsx")
assert.match(partnersPage, /getPublicPartners/)
assert.match(partnersPage, /ed-partners-hero--empty/)
assert.doesNotMatch(partnersPage, /ГАБТ|Novikov|Фиолет|Русский Дизайнерский Дом/)

const media = read("lib/editorial-media.ts")
assert.match(media, /\/product-static\/products/)
assert.doesNotMatch(media, /unsplash|pexels|data:image/i)

const staticEntries = collectStaticSitemapEntries("https://woodright.ru")
assert.ok(staticEntries.some((entry) => entry.loc === "https://woodright.ru/partners"))
assert.ok(staticEntries.some((entry) => entry.loc === "https://woodright.ru/about/production"))

const legalView = read("components/legal-page-view.tsx")
assert.match(legalView, /legal-page-toc/)
assert.match(legalView, /id=\{sectionId\(index\)\}/)

const rewritten = toStorefrontPartner({
  id: "p1",
  slug: "studio",
  name: "Studio",
  description: null,
  logo_url: "/static/partners/studio.svg",
  website_url: "https://example.com",
  images: ["/static/partners/room.jpg"],
  featured: false,
  sort_order: 1,
  is_active: true,
  presentations: [
    {
      id: "deck-1",
      title: "Deck",
      file_url: "/static/partners/studio.pdf",
      cover_url: "/static/partners/cover.jpg",
      page_count: 4,
      mime: "application/pdf",
    },
  ],
})
assert.equal(rewritten.logo_url, "/product-static/partners/studio.svg")
assert.equal(rewritten.images[0], "/product-static/partners/room.jpg")
assert.equal(rewritten.presentations[0]?.file_url, "/product-static/partners/studio.pdf")

console.log("editorial-pages.fidelity.test.ts: ok")
