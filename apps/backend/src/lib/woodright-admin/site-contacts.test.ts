import assert from "node:assert/strict"
import { describe, it } from "node:test"
import {
  mergeStagedSiteContacts,
  parseWoodrightSiteContacts,
  readStagedSiteContacts,
  WOODRIGHT_CONTACTS_SOURCE_STATUS,
} from "./site-contacts.ts"

const valid = {
  schema_version: 1,
  free_call: { display: "+7 (800) 555-17-36", e164: "+78005551736" },
  write_or_call: { display: "+7 967 258-71-44", e164: "+79672587144" },
  messengers: {
    telegram: { enabled: true },
    whatsapp: { enabled: true },
    max: { enabled: false },
  },
}

describe("site contacts", () => {
  it("accepts a valid staged document", () => {
    const parsed = parseWoodrightSiteContacts(valid)
    assert.equal(parsed.ok, true)
    if (parsed.ok) {
      assert.equal(parsed.value.schema_version, 1)
      assert.equal(parsed.value.free_call.e164, "+78005551736")
    }
  })

  it("rejects malformed E.164", () => {
    const parsed = parseWoodrightSiteContacts({
      ...valid,
      free_call: { display: "800", e164: "88005551736" },
    })
    assert.equal(parsed.ok, false)
    if (!parsed.ok) assert.equal(parsed.code, "invalid_e164")
  })

  it("rejects unknown keys", () => {
    const parsed = parseWoodrightSiteContacts({ ...valid, extra: true })
    assert.equal(parsed.ok, false)
    if (!parsed.ok) assert.equal(parsed.code, "unknown_key")
  })

  it("rejects legal and bank-like fields", () => {
    const parsed = parseWoodrightSiteContacts({ ...valid, inn: "7700000000" })
    assert.equal(parsed.ok, false)
    if (!parsed.ok) assert.equal(parsed.code, "forbidden_field")
  })

  it("rejects extra operational and legal keys", () => {
    for (const key of ["email", "hours", "ogrn", "bank_account", "legal_address"]) {
      const parsed = parseWoodrightSiteContacts({ ...valid, [key]: "x" })
      assert.equal(parsed.ok, false, key)
      if (!parsed.ok) {
        assert.equal(["forbidden_field", "unknown_key"].includes(parsed.code), true, key)
        assert.equal(parsed.field, key)
      }
    }
  })

  it("rejects showroom address mutation", () => {
    const parsed = parseWoodrightSiteContacts({
      ...valid,
      showroom_address: { address_lines: ["Москва"] },
    })
    assert.equal(parsed.ok, false)
  })

  it("preserves unrelated store metadata on merge", () => {
    const merged = mergeStagedSiteContacts(
      { locale: "ru", woodright_other: 1 },
      valid
    )
    assert.equal(merged.locale, "ru")
    assert.equal(merged.woodright_other, 1)
    assert.deepEqual(merged.woodright_site_contacts, valid)
  })

  it("treats absent staged config as not configured", () => {
    assert.equal(readStagedSiteContacts({}), null)
    assert.equal(readStagedSiteContacts(undefined), null)
    assert.equal(WOODRIGHT_CONTACTS_SOURCE_STATUS, "staged_not_live")
  })
})
