import assert from "node:assert/strict"
import { describe, it } from "node:test"
import { summarizeOperationSteps } from "./partial-failure.ts"

describe("summarizeOperationSteps", () => {
  it("reports all_ok", () => {
    const out = summarizeOperationSteps([
      { step: "create_promotion", label: "Создание акции", status: "ok" },
      { step: "attach_campaign", label: "Привязка к кампании", status: "ok" },
    ])
    assert.equal(out.verdict, "all_ok")
    assert.deepEqual(out.failed_steps, [])
    assert.equal(out.state_hint, null)
  })

  it("reports partial with honest state hint", () => {
    const out = summarizeOperationSteps([
      { step: "create_promotion", label: "Создание акции", status: "ok" },
      {
        step: "attach_campaign",
        label: "Привязка к кампании",
        status: "failed",
        error: "кампания не найдена",
      },
    ])
    assert.equal(out.verdict, "partial")
    assert.deepEqual(out.failed_steps, ["attach_campaign"])
    assert.match(out.headline, /1 из 2/)
    assert.ok(out.state_hint)
    assert.ok(out.lines.some((l) => /кампания не найдена/.test(l)))
  })

  it("uses a custom state hint on partial", () => {
    const out = summarizeOperationSteps(
      [
        { step: "a", label: "Шаг А", status: "ok" },
        { step: "b", label: "Шаг Б", status: "failed" },
      ],
      { state_hint_on_partial: "Акция создана как черновик, но не привязана к кампании" }
    )
    assert.match(out.state_hint ?? "", /не привязана к кампании/)
  })

  it("reports all_failed with no false state warnings", () => {
    const out = summarizeOperationSteps([
      { step: "create_promotion", label: "Создание акции", status: "failed", error: "код занят" },
    ])
    assert.equal(out.verdict, "all_failed")
    assert.match(out.headline, /изменений нет/)
    assert.equal(out.state_hint, null)
  })

  it("ignores skipped steps in the verdict but shows them in lines", () => {
    const out = summarizeOperationSteps([
      { step: "a", label: "Шаг А", status: "ok" },
      { step: "b", label: "Шаг Б", status: "skipped" },
    ])
    assert.equal(out.verdict, "all_ok")
    assert.ok(out.lines.some((l) => /пропущено/.test(l)))
  })

  it("reports nothing_ran when every step was skipped", () => {
    const out = summarizeOperationSteps([{ step: "a", label: "Шаг А", status: "skipped" }])
    assert.equal(out.verdict, "nothing_ran")
  })
})
