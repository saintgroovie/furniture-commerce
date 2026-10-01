import assert from "node:assert/strict"
import { test } from "node:test"
import { COMMANDS } from "./commands.ts"

test("palette commands only navigate - no write verbs, no API routes", () => {
  for (const command of COMMANDS) {
    assert.ok(command.href.startsWith("/"), command.href)
    assert.ok(!command.href.startsWith("/api/"), command.href)
    assert.ok(!/опубликов|снять|удал|сохран|перевести|назнач/i.test(command.title), command.title)
  }
})

test("palette commands point at live sections, not legacy ones", () => {
  for (const command of COMMANDS) {
    assert.ok(!/^\/(people|requests|media|site)(\?|$)/.test(command.href), command.href)
  }
})
