import assert from "node:assert/strict"
import { describe, it } from "node:test"
import { buildStorefrontEligibility } from "./storefront-eligibility.ts"

describe("buildStorefrontEligibility", () => {
  it("marks non-published as not listed", () => {
    const vm = buildStorefrontEligibility({ status: "draft", metadata: { collection: "oliver" } })
    assert.equal(vm.kind, "draft")
    assert.equal(vm.listed_in_main_catalog, false)
    assert.match(vm.summary_label, /Не в каталоге/)
  })

  it("flags paused collections", () => {
    const vm = buildStorefrontEligibility({
      status: "published",
      metadata: { collection: "oxford" },
    })
    assert.equal(vm.kind, "paused_collection")
    assert.equal(vm.listed_in_main_catalog, false)
  })

  it("flags oliver-kids collection as kids catalog", () => {
    const vm = buildStorefrontEligibility({
      status: "published",
      metadata: { collection: "oliver-kids" },
    })
    assert.equal(vm.kind, "kids_catalog")
    assert.equal(vm.listed_in_kids_catalog, true)
    assert.equal(vm.listed_in_main_catalog, false)
  })

  it("flags Oliver kids handles even without collection", () => {
    const vm = buildStorefrontEligibility({
      status: "published",
      handle: " OL-84-2 ",
      metadata: {},
    })
    assert.equal(vm.kind, "kids_catalog")
    assert.equal(vm.listed_in_kids_catalog, true)
  })

  it("flags storefront_section=kids and willie-winkie", () => {
    assert.equal(
      buildStorefrontEligibility({
        status: "published",
        metadata: { storefront_section: "kids" },
      }).kind,
      "kids_catalog"
    )
    assert.equal(
      buildStorefrontEligibility({
        status: "published",
        metadata: { collection: "willie-winkie" },
      }).kind,
      "kids_catalog"
    )
  })

  it("excludes BESPOKE from kids/main listing claims", () => {
    const vm = buildStorefrontEligibility({
      status: "published",
      metadata: { collection: "oliver-kids" },
      classificationCode: "BESPOKE",
    })
    assert.equal(vm.kind, "bespoke_quote")
    assert.equal(vm.listed_in_kids_catalog, false)
  })

  it("treats active adult collection as main catalog candidate", () => {
    const vm = buildStorefrontEligibility({
      status: "published",
      metadata: { collection: "greenwich" },
    })
    assert.equal(vm.kind, "main_catalog_candidate")
    assert.equal(vm.listed_in_main_catalog, true)
  })
})
