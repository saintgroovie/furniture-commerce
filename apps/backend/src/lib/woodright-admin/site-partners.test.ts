import assert from "node:assert/strict"
import { describe, it } from "node:test"
import {
  emptyPartnersDocument,
  mergePartnersDocument,
  parseWoodrightPartners,
  publicPartners,
  readPartnersDocument,
} from "./site-partners.ts"

const partner = {
  id: "p_studio",
  slug: "studio-north",
  name: "Studio North",
  description: "Архитектурное бюро",
  logo_url: "/static/partners/studio-north.svg",
  website_url: "https://example.com",
  images: ["/static/partners/studio-north-1.jpg"],
  featured: true,
  sort_order: 1,
  is_active: true,
  presentations: [
    {
      id: "deck-1",
      title: "Презентация бюро",
      file_url: "/static/partners/studio-north.pdf",
      cover_url: "/static/partners/studio-north-cover.jpg",
      page_count: 12,
      mime: "application/pdf",
    },
  ],
}

const valid = { schema_version: 1 as const, partners: [partner] }

describe("site partners", () => {
  it("accepts an empty live document", () => {
    const parsed = parseWoodrightPartners({ schema_version: 1, partners: [] })
    assert.equal(parsed.ok, true)
    if (parsed.ok) assert.equal(parsed.value.partners.length, 0)
  })

  it("accepts a valid partner with presentation", () => {
    const parsed = parseWoodrightPartners(valid)
    assert.equal(parsed.ok, true)
    if (parsed.ok) {
      assert.equal(parsed.value.partners[0]?.slug, "studio-north")
      assert.equal(parsed.value.partners[0]?.presentations[0]?.page_count, 12)
    }
  })

  it("rejects invented javascript URLs", () => {
    const parsed = parseWoodrightPartners({
      schema_version: 1,
      partners: [{ ...partner, logo_url: "javascript:alert(1)" }],
    })
    assert.equal(parsed.ok, false)
  })

  it("rejects external https media that CSP would block", () => {
    const parsed = parseWoodrightPartners({
      schema_version: 1,
      partners: [{ ...partner, logo_url: "https://cdn.example.com/logo.svg" }],
    })
    assert.equal(parsed.ok, false)
    if (!parsed.ok) assert.equal(parsed.code, "invalid_url")
  })

  it("rejects unknown keys", () => {
    const parsed = parseWoodrightPartners({ ...valid, extra: true })
    assert.equal(parsed.ok, false)
    if (!parsed.ok) assert.equal(parsed.code, "unknown_key")
  })

  it("rejects duplicate slugs", () => {
    const parsed = parseWoodrightPartners({
      schema_version: 1,
      partners: [partner, { ...partner, id: "p2" }],
    })
    assert.equal(parsed.ok, false)
    if (!parsed.ok) assert.equal(parsed.code, "duplicate_slug")
  })

  it("hides inactive partners from the public list", () => {
    const visible = publicPartners({
      schema_version: 1,
      partners: [
        { ...partner, is_active: false },
        { ...partner, id: "p2", slug: "other", featured: false, sort_order: 2 },
      ],
    })
    assert.equal(visible.length, 1)
    assert.equal(visible[0]?.slug, "other")
  })

  it("reads missing metadata as an empty document", () => {
    assert.deepEqual(readPartnersDocument(null), emptyPartnersDocument())
    assert.deepEqual(readPartnersDocument({}), emptyPartnersDocument())
  })

  it("preserves unrelated store metadata on merge", () => {
    const merged = mergePartnersDocument({ locale: "ru", woodright_site_contacts: 1 }, valid)
    assert.equal(merged.locale, "ru")
    assert.equal(merged.woodright_site_contacts, 1)
    assert.deepEqual(merged.woodright_partners, valid)
  })
})
