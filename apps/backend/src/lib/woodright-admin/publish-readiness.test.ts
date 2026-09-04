import assert from "node:assert/strict"
import { describe, it } from "node:test"
import { catalogPublishGateAudit, computeWorkspacePublishReadiness, decideWorkspacePublish } from "./publish-readiness.ts"

function standardReady(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    title: "Oliver",
    status: "draft",
    thumbnail: "/static/p.jpg",
    metadata: { collection: "oliver" },
    images: [{ url: "/static/p.jpg" }],
    variants: [
      {
        sku: "OL-01-1",
        prices: [{ amount: 189000, currency_code: "rub" }],
      },
    ],
    product_classification: { product_type: "STANDARD" },
    ...overrides,
  }
}

describe("workspace publish readiness", () => {
  it("marks a healthy STANDARD product ready", () => {
    const result = computeWorkspacePublishReadiness(standardReady())
    assert.equal(result.ready, true)
    assert.equal(result.blockers.length, 0)
  })

  it("blocks STANDARD without a price", () => {
    const result = computeWorkspacePublishReadiness(
      standardReady({
        variants: [{ sku: "OL-01-1", prices: [] }],
      })
    )
    assert.equal(result.ready, false)
    assert.equal(result.blockers.some((item) => item.code === "missing_price"), true)
  })

  it("blocks missing photo", () => {
    const result = computeWorkspacePublishReadiness(
      standardReady({ thumbnail: null, images: [] })
    )
    assert.equal(result.ready, false)
    assert.equal(result.blockers.some((item) => item.code === "missing_media"), true)
  })

  it("blocks UNKNOWN classification", () => {
    const result = computeWorkspacePublishReadiness(
      standardReady({ product_classification: {} })
    )
    assert.equal(result.ready, false)
    assert.equal(result.blockers.some((item) => item.code === "missing_classification"), true)
  })

  it("blocks invalid collection", () => {
    const result = computeWorkspacePublishReadiness(
      standardReady({ metadata: { collection: "provence" } })
    )
    assert.equal(result.ready, false)
    assert.equal(result.blockers.some((item) => item.code === "invalid_collection"), true)
  })

  it("warns CONFIGURABLE without execution media and does not block", () => {
    const result = computeWorkspacePublishReadiness(
      standardReady({
        product_classification: { product_type: "CONFIGURABLE" },
      })
    )
    assert.equal(result.ready, true)
    assert.equal(result.warnings.some((item) => item.code === "missing_execution_setup"), true)
  })

  it("allows BESPOKE without a cart price", () => {
    const result = computeWorkspacePublishReadiness(
      standardReady({
        product_classification: { product_type: "BESPOKE" },
        variants: [{ sku: "BS-01-1", prices: [] }],
      })
    )
    assert.equal(result.ready, true)
    assert.equal(result.blockers.some((item) => item.code === "missing_price"), false)
  })

  it("treats missing dimensions as a warning, not a blocker", () => {
    const result = computeWorkspacePublishReadiness(standardReady())
    assert.equal(result.ready, true)
    assert.equal(result.warnings.some((item) => item.code === "missing_dimensions"), true)
  })

  it("blocks publish when not ready and keeps draft intent", () => {
    const readiness = computeWorkspacePublishReadiness(
      standardReady({ variants: [{ sku: "OL-01-1", prices: [] }] })
    )
    const decision = decideWorkspacePublish("draft", readiness)
    assert.equal(decision.ok, false)
    if (!decision.ok) assert.equal(decision.code, "not_ready")
  })

  it("allows publish when ready", () => {
    const result = decideWorkspacePublish("draft", computeWorkspacePublishReadiness(standardReady()))
    assert.equal(result.ok, true)
    if (result.ok) assert.equal(result.next_status, "published")
  })

  it("does not treat warnings as errors", () => {
    const result = computeWorkspacePublishReadiness(standardReady())
    assert.equal(result.blockers.every((item) => item.severity === "error"), true)
    assert.equal(result.warnings.every((item) => item.severity === "warning"), true)
  })

  it("audits already published catalog without mutating it", () => {
    const healthy = computeWorkspacePublishReadiness(standardReady({ status: "published" }))
    const missingPrice = computeWorkspacePublishReadiness(
      standardReady({
        status: "published",
        variants: [{ sku: "OL-02-1", prices: [] }],
      })
    )
    const audit = catalogPublishGateAudit([
      { status: "published", publish: healthy },
      { status: "published", publish: missingPrice },
      { status: "draft", publish: missingPrice },
    ])
    assert.equal(audit.evaluated, 3)
    assert.equal(audit.published, 2)
    assert.equal(audit.would_fail, 1)
    assert.equal(audit.by_code.missing_price, 1)
  })
})
