import assert from "node:assert/strict"
import { describe, it } from "node:test"
import { decideWorkspaceDbIsolation } from "./db-isolation.ts"

const allowed = {
  WOODRIGHT_DB_ISOLATION: "isolated",
  DATABASE_URL: "postgres://workspace_it:secret@127.0.0.1:55432/workspace_it",
}

describe("decideWorkspaceDbIsolation", () => {
  it("allows an explicit loopback workspace_it database", () => {
    const decision = decideWorkspaceDbIsolation(allowed)
    assert.equal(decision.ok, true)
  })

  it("refuses the daily database name and port", () => {
    assert.equal(
      decideWorkspaceDbIsolation({
        ...allowed,
        DATABASE_URL: "postgres://postgres:postgres@127.0.0.1:5432/medusa-store",
      }).ok,
      false
    )
    assert.equal(
      decideWorkspaceDbIsolation({
        ...allowed,
        DATABASE_URL: "postgres://workspace_it:secret@127.0.0.1:55432/medusa-store",
      }).ok,
      false
    )
  })

  it("refuses public and demo roles even with an isolated url", () => {
    assert.equal(decideWorkspaceDbIsolation({ ...allowed, WOODRIGHT_EXPOSURE: "public" }).ok, false)
    assert.equal(
      decideWorkspaceDbIsolation({ ...allowed, WOODRIGHT_RUNTIME_ROLE: "public_demo" }).ok,
      false
    )
    assert.equal(decideWorkspaceDbIsolation({ ...allowed, WOODRIGHT_DB_ISOLATION: "" }).ok, false)
  })

  it("refuses query overrides of host or port", () => {
    const decision = decideWorkspaceDbIsolation({
      ...allowed,
      DATABASE_URL: "postgres://test:test@127.0.0.1:55432/workspace_it?host=remote.example&port=5432",
    })
    assert.equal(decision.ok, false)
  })
})
