import assert from "node:assert/strict"
import { describe, it } from "node:test"
import {
  cookieSecureForRuntime,
  isLocalQaHttp,
} from "./cookie-secure-runtime.ts"

describe("cookieSecureForRuntime", () => {
  it("allows HTTP cookies for LaunchAgent qa + MEDUSA_LOCAL_HTTP=1", () => {
    assert.equal(
      cookieSecureForRuntime({
        isProduction: true,
        localHttp: true,
        backendMode: "qa",
      }),
      false
    )
    assert.equal(
      isLocalQaHttp({ localHttp: true, backendMode: "qa" }),
      true
    )
  })

  it("allows HTTP cookies for local develop + MEDUSA_LOCAL_HTTP=1", () => {
    assert.equal(
      cookieSecureForRuntime({
        isProduction: true,
        localHttp: true,
        backendMode: "develop",
      }),
      false
    )
  })

  it("keeps Secure when MODE=qa but MEDUSA_LOCAL_HTTP is unset (HTTPS misconfig)", () => {
    assert.equal(
      cookieSecureForRuntime({
        isProduction: true,
        localHttp: false,
        backendMode: "qa",
      }),
      true
    )
    assert.equal(
      isLocalQaHttp({ localHttp: false, backendMode: "qa" }),
      false
    )
  })

  it("keeps Secure for production LOCAL_HTTP leak without qa/develop mode", () => {
    assert.equal(
      cookieSecureForRuntime({
        isProduction: true,
        localHttp: true,
        backendMode: "",
      }),
      true
    )
  })

  it("keeps Secure if qa+LOCAL_HTTP leak onto public_demo", () => {
    assert.equal(
      cookieSecureForRuntime({
        isProduction: true,
        localHttp: true,
        backendMode: "qa",
        exposure: "public",
        runtimeRole: "public_demo",
      }),
      true
    )
    assert.equal(
      isLocalQaHttp({
        localHttp: true,
        backendMode: "qa",
        exposure: "public",
        runtimeRole: "public_demo",
      }),
      false
    )
  })

  it("keeps Secure if qa+LOCAL_HTTP leak onto public production", () => {
    assert.equal(
      cookieSecureForRuntime({
        isProduction: true,
        localHttp: true,
        backendMode: "qa",
        exposure: "public",
        runtimeRole: "public_production",
      }),
      true
    )
  })

  it("keeps Secure for ordinary production", () => {
    assert.equal(
      cookieSecureForRuntime({
        isProduction: true,
        localHttp: false,
        backendMode: "",
      }),
      true
    )
  })

  it("never sets Secure outside production", () => {
    assert.equal(
      cookieSecureForRuntime({
        isProduction: false,
        localHttp: false,
        backendMode: "",
      }),
      false
    )
  })
})
