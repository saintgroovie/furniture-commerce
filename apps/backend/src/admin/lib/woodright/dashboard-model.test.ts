import assert from "node:assert/strict"
import { describe, it } from "node:test"
import {
  buildDraftCounterVM,
  buildPaginationVM,
  buildThumbnailSampleVM,
  countMissingThumbnails,
  formatRuCount,
  pickFirstSku,
  planSamplePages,
  productStatusLabel,
} from "./dashboard-model.ts"

describe("formatRuCount", () => {
  it("picks correct Russian plural forms", () => {
    const forms: [string, string, string] = ["черновик", "черновика", "черновиков"]
    assert.equal(formatRuCount(1, forms), "1 черновик")
    assert.equal(formatRuCount(2, forms), "2 черновика")
    assert.equal(formatRuCount(5, forms), "5 черновиков")
    assert.equal(formatRuCount(11, forms), "11 черновиков")
    assert.equal(formatRuCount(21, forms), "21 черновик")
    assert.equal(formatRuCount(104, forms), "104 черновика")
  })
})

describe("buildDraftCounterVM", () => {
  it("reports absence without a number", () => {
    const vm = buildDraftCounterVM(0)
    assert.equal(vm.has_drafts, false)
    assert.equal(vm.label, "Черновиков нет")
  })

  it("formats positive counts", () => {
    assert.equal(buildDraftCounterVM(3).label, "3 черновика")
    assert.equal(buildDraftCounterVM(3).has_drafts, true)
  })
})

describe("thumbnail sample", () => {
  it("counts empty and missing thumbnails", () => {
    assert.equal(
      countMissingThumbnails([
        { thumbnail: "/a.jpg" },
        { thumbnail: "" },
        { thumbnail: "   " },
        { thumbnail: null },
        {},
      ]),
      4
    )
  })

  it("marks complete coverage as exact", () => {
    const vm = buildThumbnailSampleVM({ checked: 10, missing: 2, total: 10 })
    assert.equal(vm.complete, true)
    assert.equal(vm.note, null)
    assert.equal(vm.label, "Без главного фото: 2")
  })

  it("labels partial coverage as a sample estimate, never a global total", () => {
    const vm = buildThumbnailSampleVM({ checked: 150, missing: 7, total: 900 })
    assert.equal(vm.complete, false)
    assert.ok(vm.label.includes("оценка по выборке"))
    assert.ok(vm.note?.includes("150 из 900"))
  })

  it("reports clean samples honestly", () => {
    const full = buildThumbnailSampleVM({ checked: 5, missing: 0, total: 5 })
    assert.equal(full.label, "У всех опубликованных есть главное фото")
    const partial = buildThumbnailSampleVM({ checked: 100, missing: 0, total: 300 })
    assert.ok(partial.label.includes("оценка по выборке"))
  })
})

describe("pickFirstSku", () => {
  it("returns the first non-empty sku", () => {
    assert.equal(pickFirstSku([{ sku: "" }, { sku: "  " }, { sku: "OL-01-1" }]), "OL-01-1")
    assert.equal(pickFirstSku([]), null)
    assert.equal(pickFirstSku(null), null)
  })
})

describe("productStatusLabel", () => {
  it("maps known statuses to Russian labels", () => {
    assert.equal(productStatusLabel("published"), "Опубликован")
    assert.equal(productStatusLabel("draft"), "Черновик")
    assert.equal(productStatusLabel("proposed"), "На проверке")
    assert.equal(productStatusLabel("rejected"), "Отклонён")
    assert.equal(productStatusLabel(undefined), "Статус не определён")
  })
})

describe("buildPaginationVM", () => {
  it("computes range labels and nav availability", () => {
    const first = buildPaginationVM({ count: 45, offset: 0, limit: 20 })
    assert.deepEqual(first, { has_prev: false, has_next: true, label: "1 - 20 из 45" })
    const last = buildPaginationVM({ count: 45, offset: 40, limit: 20 })
    assert.deepEqual(last, { has_prev: true, has_next: false, label: "41 - 45 из 45" })
    const empty = buildPaginationVM({ count: 0, offset: 0, limit: 20 })
    assert.deepEqual(empty, { has_prev: false, has_next: false, label: "0 - 0 из 0" })
  })
})

describe("planSamplePages", () => {
  it("caps pages at maxPages and covers small catalogs exactly", () => {
    assert.equal(planSamplePages({ total: 30, pageSize: 50, maxPages: 3 }), 1)
    assert.equal(planSamplePages({ total: 120, pageSize: 50, maxPages: 3 }), 3)
    assert.equal(planSamplePages({ total: 900, pageSize: 50, maxPages: 3 }), 3)
    assert.equal(planSamplePages({ total: 0, pageSize: 50, maxPages: 3 }), 0)
  })
})
