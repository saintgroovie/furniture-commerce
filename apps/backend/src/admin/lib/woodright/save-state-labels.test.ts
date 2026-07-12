import assert from "node:assert/strict"
import { describe, it } from "node:test"
import { SAVE_STATE_LABELS, saveStateLabel } from "./save-state-labels.ts"
import { saveStatusLabel } from "../product-workspace/save-state.ts"
import type { SaveStatus } from "../product-workspace/types"

const ALL_STATUSES: SaveStatus[] = [
  "clean",
  "dirty",
  "saving",
  "saved",
  "error",
  "conflict",
]

describe("save state labels", () => {
  it("covers every SaveStatus with a non-empty Russian label", () => {
    for (const status of ALL_STATUSES) {
      assert.ok(SAVE_STATE_LABELS[status].length > 0, status)
      assert.equal(saveStateLabel(status), SAVE_STATE_LABELS[status])
    }
  })

  it("matches the labels used by save-state.ts", () => {
    for (const status of ALL_STATUSES) {
      assert.equal(saveStatusLabel(status), saveStateLabel(status), status)
    }
  })

  it("avoids em/en dashes per dash-typography rule", () => {
    for (const status of ALL_STATUSES) {
      assert.ok(!/[—–]/.test(SAVE_STATE_LABELS[status]), status)
    }
  })
})
