import assert from "node:assert/strict"
import { describe, it } from "node:test"
import {
  buildPublishChecklist,
  checklistActionForCode,
  isAdminOnlyBlocker,
} from "./publish-checklist.ts"
import { computeWorkspacePublishReadiness } from "./publish-readiness.ts"

describe("publish checklist mapping", () => {
  it("maps missing_price to focus_price", () => {
    assert.equal(checklistActionForCode("missing_price"), "focus_price")
  })

  it("maps missing_media to focus_media", () => {
    assert.equal(checklistActionForCode("missing_media"), "focus_media")
  })

  it("maps missing_title to focus_title", () => {
    assert.equal(checklistActionForCode("missing_title"), "focus_title")
  })

  it("does not attach an action to collection blockers", () => {
    assert.equal(checklistActionForCode("missing_collection"), undefined)
    assert.equal(isAdminOnlyBlocker("missing_collection"), true)
    assert.equal(isAdminOnlyBlocker("invalid_collection"), true)
  })

  it("keeps execution setup as a warning, not a blocker action", () => {
    const readiness = computeWorkspacePublishReadiness({
      title: "QA",
      status: "draft",
      metadata: { collection: "oliver" },
      variants: [{ sku: "QA-1" }],
      product_classification: { product_type: "CONFIGURABLE" },
    })
    const execution = readiness.warnings.find((item) => item.code === "missing_execution_setup")
    assert.ok(execution)
    assert.equal(readiness.blockers.some((item) => item.code === "missing_execution_setup"), false)
    const items = buildPublishChecklist(readiness)
    const warning = items.find((item) => item.id === "missing_execution_setup")
    assert.equal(warning?.kind, "warning")
    assert.equal(warning?.adminOnly, true)
    assert.equal(warning?.action, undefined)
  })

  it("marks completed core rows and actionable price/media blockers", () => {
    const items = buildPublishChecklist({
      ready: false,
      blockers: [
        { severity: "error", code: "missing_price", message: "Добавьте цену" },
        { severity: "error", code: "missing_media", message: "Добавьте фотографию" },
      ],
      warnings: [{ severity: "warning", code: "missing_dimensions", message: "Размеры пока не указаны" }],
    })
    assert.equal(items.find((item) => item.id === "title")?.kind, "done")
    assert.equal(items.find((item) => item.id === "sku")?.kind, "done")
    assert.equal(items.find((item) => item.id === "collection")?.kind, "done")
    assert.equal(items.find((item) => item.id === "missing_price")?.action, "focus_price")
    assert.equal(items.find((item) => item.id === "missing_media")?.action, "focus_media")
    assert.equal(items.find((item) => item.id === "missing_dimensions")?.kind, "warning")
  })
})
