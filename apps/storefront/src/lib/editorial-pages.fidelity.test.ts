/**
 * Editorial content pages + partners IA.
 *
 *   yarn dlx tsx src/lib/editorial-pages.fidelity.test.ts
 */
import assert from "node:assert/strict"
import { existsSync, readFileSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"
import { footer, nav, partnersCopy } from "./woodright-copy"
import { collectStaticSitemapEntries } from "./sitemap-entries"
import { toStorefrontPartner } from "./api/partners"
import { LEGACY_PARTNERS } from "./legacy-partners"

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
assert.match(partnersPage, /PartnerIndex/)
assert.match(partnersPage, /partnersCopy\.viewPresentation/)
assert.match(partnersPage, /force-dynamic/)
assert.doesNotMatch(partnersPage, /ed-partners-strip/)
assert.doesNotMatch(partnersPage, /Novikov|Фиолет|Русский Дизайнерский Дом/)
assert.equal(partnersCopy.viewPresentation, "Смотреть презентацию")
assert.equal(partnersCopy.emptyTitle, "Студий в списке пока нет")

const legacy = read("lib/legacy-partners.ts")
assert.match(legacy, /Большой театр/)
assert.match(legacy, /ВГБИЛ им\. М\. И\. Рудомино/)
assert.match(legacy, /Городское собрание Сочи/)
assert.match(legacy, /Академия управления МВД/)
assert.match(legacy, /Мариинский дворец/)
assert.match(legacy, /ПАО «Совкомфлот»/)
assert.match(legacy, /Тверская картинная галерея/)
assert.doesNotMatch(legacy, /Novikov|Фиолет|Русский Дизайнерский Дом|ГАБТ/)
assert.equal(LEGACY_PARTNERS.length, 7)
assert.deepEqual(
  LEGACY_PARTNERS.map((partner) => partner.slug),
  ["bolshoi", "vgbll", "sochi", "mvd-academy", "mariinsky-palace", "sovcomflot", "tver-gallery"]
)
assert.ok(LEGACY_PARTNERS.every((partner) => (partner.presentations[0]?.slides?.length ?? 0) >= 3))
assert.equal(LEGACY_PARTNERS.find((partner) => partner.slug === "bolshoi")?.logo_url, null)
for (const file of [
  "vgbll.svg",
  "sochi.svg",
  "mvd-academy.png",
  "mariinsky-palace.svg",
  "sovcomflot.png",
  "tver-gallery.svg",
]) {
  assert.ok(
    existsSync(join(srcRoot, "../public/editorial/partners", file)),
    `missing partner mark ${file}`
  )
}

const partnerIndex = read("components/partners/partner-index.tsx")
assert.match(partnerIndex, /ed-logo-card/)
assert.match(partnerIndex, /PartnerMark/)
assert.match(partnerIndex, /ed-logo-mark/)
assert.match(partnerIndex, /partnersCopy\.viewPresentation/)
assert.doesNotMatch(partnerIndex, /ed-logo-media/)
assert.match(read("components/partners/partner-mark.tsx"), /БОЛЬШОЙ/)
assert.match(read("components/partners/partner-mark.tsx"), /СОВКОМФЛОТ/)
assert.doesNotMatch(read("components/partners/partner-mark.tsx"), /Novikov|Фиолет|unsplash/)

const contactsLayout = read("components/contacts-page-layout.tsx")
assert.match(contactsLayout, /contacts-page-masthead/)
assert.match(contactsLayout, /contacts-page-visit-hint/)

const globals = read("app/globals.css")
assert.match(globals, /\.contacts-page-masthead\s*\{[^}]*grid-column:\s*1\s*\/\s*span\s*7/s)
assert.match(globals, /\.contacts-page-media\s*\{[^}]*grid-column:\s*1\s*\/\s*-1/s)

const viewer = read("components/partners/presentation-viewer.tsx")
assert.match(viewer, /EditorialDeck/)
assert.match(viewer, /ed-deck-stage/)
assert.doesNotMatch(viewer, /iframe/)
assert.match(globals, /\.ed-logo-card\s*\{/)
assert.match(globals, /\.ed-logo-mark\s*\{/)
assert.match(globals, /\.ed-deck-stage\s*\{/)

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
