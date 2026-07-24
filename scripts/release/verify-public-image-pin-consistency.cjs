#!/usr/bin/env node
/**
 * Fail-closed consistency check for public image pins.
 *
 * Compares expected release pair against:
 *   - Dokploy compose .env image vars
 *   - docker compose resolved images
 *   - running container digests + release labels
 *   - ACTIVE_PUBLIC.json
 *   - DOKPLOY_IMAGE_PINS.env
 *   - optional release manifest / ACTIVE_RELEASE
 *   - backend alias contract (compose file)
 *
 * Modes:
 *   --self-test
 *   --fixture-dir <dir>
 *   --inspect-json <file>
 *   --live   (requires docker + paths on public host)
 *
 * Never prints secrets. Exit non-zero on any mismatch.
 */
"use strict"

const fs = require("node:fs")
const path = require("node:path")
const { spawnSync } = require("node:child_process")

const DIGEST_RE = /^sha256:[0-9a-f]{64}$/
const SHA_RE = /^[0-9a-f]{40}$/
const DEFAULT_BE = "woodright-staging-backend"
const DEFAULT_SF = "woodright-staging-storefront"
const BE_IMAGE_KEYS = ["WOODRIGHT_BACKEND_IMAGE"]
const SF_IMAGE_KEYS = ["WOODRIGHT_STOREFRONT_IMAGE", "STOREFRONT_IMAGE"]

function arg(name, fallback) {
  const i = process.argv.indexOf(name)
  if (i >= 0 && process.argv[i + 1]) return process.argv[i + 1]
  return fallback
}

function hasFlag(name) {
  return process.argv.includes(name)
}

function fail(message, extra = {}) {
  console.error(JSON.stringify({ ok: false, message, ...extra }, null, 2))
  process.exit(1)
}

function ok(payload) {
  console.log(JSON.stringify({ ok: true, ...payload }, null, 2))
}

function readJson(p) {
  return JSON.parse(fs.readFileSync(p, "utf8"))
}

function digestFromRef(ref) {
  if (!ref) return null
  const s = String(ref).trim()
  if (DIGEST_RE.test(s)) return s
  const m = /@(sha256:[0-9a-f]+)\b/.exec(s)
  if (!m) return null
  return DIGEST_RE.test(m[1]) ? m[1] : null
}

function classifyImageRef(ref) {
  if (ref == null || ref === "") return { kind: "missing" }
  const s = String(ref).trim()
  if (DIGEST_RE.test(s)) return { kind: "ok", digest: s }
  if (!s.includes("@sha256:")) return { kind: "mutable" }
  const m = /@sha256:([0-9a-f]+)/.exec(s)
  if (!m) return { kind: "mutable" }
  if (m[1].length !== 64) return { kind: "truncated", digest: `sha256:${m[1]}` }
  return { kind: "ok", digest: `sha256:${m[1]}` }
}

function isMutableRef(ref) {
  return classifyImageRef(ref).kind === "mutable"
}

function checkRef(errors, label, ref, wantDigest, forbidden) {
  const c = classifyImageRef(ref)
  if (c.kind === "missing") {
    errors.push(`${label} missing`)
    return
  }
  if (c.kind === "mutable") {
    errors.push(`${label} mutable/tag without digest`)
    return
  }
  if (c.kind === "truncated") {
    errors.push(`${label} truncated/invalid digest`)
    return
  }
  if (wantDigest && c.digest !== wantDigest) {
    errors.push(`${label} digest mismatch`)
  }
  if (forbidden && forbidden.has(c.digest)) {
    errors.push(`${label} uses forbidden stale digest`)
  }
}

function parseEnvText(text) {
  const out = {}
  for (const line of String(text || "").split(/\r?\n/)) {
    const t = line.trim()
    if (!t || t.startsWith("#") || !t.includes("=")) continue
    const i = t.indexOf("=")
    out[t.slice(0, i)] = t.slice(i + 1)
  }
  return out
}

function assertComposeDeclaresBackendAlias(composePath) {
  const text = fs.readFileSync(composePath, "utf8")
  const backendIdx = text.search(/^  backend:\s*$/m)
  if (backendIdx < 0) return { ok: false, reason: "compose missing backend service" }
  const nextSvc = text.slice(backendIdx + 1).search(/^  [a-zA-Z0-9_-]+:\s*$/m)
  const backendBlock =
    nextSvc < 0
      ? text.slice(backendIdx)
      : text.slice(backendIdx, backendIdx + 1 + nextSvc)
  if (!/woodright_staging:\s*\n\s+aliases:\s*\n\s+-\s+backend\b/.test(backendBlock)) {
    return { ok: false, reason: "backend alias missing in compose" }
  }
  if (!/\$\{WOODRIGHT_BACKEND_IMAGE/.test(text) || !/\$\{WOODRIGHT_STOREFRONT_IMAGE/.test(text)) {
    return {
      ok: false,
      reason: "compose must interpolate WOODRIGHT_*_IMAGE",
    }
  }
  return { ok: true }
}

/**
 * @param {object} doc
 */
function evaluate(doc) {
  const errors = []
  const expected = doc.expected || {}
  const wantSha = expected.release_sha
  const wantBe = expected.backend_digest
  const wantSf = expected.storefront_digest

  if (!SHA_RE.test(wantSha || "")) errors.push("expected.release_sha invalid")
  if (!DIGEST_RE.test(wantBe || "")) errors.push("expected.backend_digest invalid")
  if (!DIGEST_RE.test(wantSf || "")) errors.push("expected.storefront_digest invalid")

  const forbidden = new Set(doc.forbidden_digests || [])

  function checkDigest(label, dig, want) {
    if (!dig) {
      errors.push(`${label} missing`)
      return
    }
    if (!DIGEST_RE.test(dig)) {
      errors.push(`${label} invalid digest`)
      return
    }
    if (want && dig !== want) errors.push(`${label} digest mismatch`)
    if (forbidden.has(dig)) errors.push(`${label} uses forbidden stale digest`)
  }

  const env = doc.env || {}
  for (const k of BE_IMAGE_KEYS) {
    if (Object.prototype.hasOwnProperty.call(env, k) || doc.require_all_env_keys) {
      checkRef(errors, `env.${k}`, env[k], wantBe, forbidden)
    }
  }
  for (const k of SF_IMAGE_KEYS) {
    if (Object.prototype.hasOwnProperty.call(env, k) || doc.require_all_env_keys) {
      checkRef(errors, `env.${k}`, env[k], wantSf, forbidden)
    }
  }
  // Partial pair: one side present and correct, other missing/stale
  if (env.WOODRIGHT_BACKEND_IMAGE && env.WOODRIGHT_STOREFRONT_IMAGE) {
    const beC = classifyImageRef(env.WOODRIGHT_BACKEND_IMAGE)
    const sfC = classifyImageRef(env.WOODRIGHT_STOREFRONT_IMAGE)
    if (beC.kind === "ok" && sfC.kind === "ok") {
      if (beC.digest === wantBe && sfC.digest !== wantSf) {
        errors.push("one-sided update: storefront env stale")
      }
      if (sfC.digest === wantSf && beC.digest !== wantBe) {
        errors.push("one-sided update: backend env stale")
      }
    }
  }

  const compose = doc.compose_resolved || {}
  if (compose.backend != null || compose.storefront != null || doc.require_compose) {
    checkRef(errors, "compose.backend", compose.backend, wantBe, forbidden)
    checkRef(errors, "compose.storefront", compose.storefront, wantSf, forbidden)
  }

  const running = doc.running || {}
  if (running.backend_digest != null || doc.require_running) {
    if (doc.require_running) {
      if (running.backend_running !== true) errors.push("running.backend not running")
      if (running.storefront_running !== true) errors.push("running.storefront not running")
    }
    checkDigest("running.backend", running.backend_digest, wantBe)
    checkDigest("running.storefront", running.storefront_digest, wantSf)
    if (running.backend_release_sha && running.backend_release_sha !== wantSha) {
      errors.push("running.backend_release_sha mismatch")
    }
    if (running.storefront_release_sha && running.storefront_release_sha !== wantSha) {
      errors.push("running.storefront_release_sha mismatch")
    }
    if (!running.backend_release_sha && doc.require_running_sha) {
      errors.push("running.backend_release_sha missing")
    }
    if (!running.storefront_release_sha && doc.require_running_sha) {
      errors.push("running.storefront_release_sha missing")
    }
    if (doc.require_running) {
      if (running.backend_role !== "public_demo") {
        errors.push("running.backend role missing_or_mismatch")
      }
      if (running.storefront_role !== "public_demo") {
        errors.push("running.storefront role missing_or_mismatch")
      }
      if (running.backend_exposure !== "public") {
        errors.push("running.backend exposure missing_or_mismatch")
      }
      if (running.storefront_exposure !== "public") {
        errors.push("running.storefront exposure missing_or_mismatch")
      }
    } else {
      if (running.backend_role && running.backend_role !== "public_demo") {
        errors.push("running.backend role mismatch")
      }
      if (running.storefront_role && running.storefront_role !== "public_demo") {
        errors.push("running.storefront role mismatch")
      }
      if (running.backend_exposure && running.backend_exposure !== "public") {
        errors.push("running.backend exposure mismatch")
      }
      if (running.storefront_exposure && running.storefront_exposure !== "public") {
        errors.push("running.storefront exposure mismatch")
      }
    }
    if (
      running.backend_digest &&
      running.storefront_digest &&
      running.backend_digest === wantBe &&
      running.storefront_digest !== wantSf
    ) {
      errors.push("running containers mixed release pair")
    }
  }

  const ap = doc.active_public || null
  if (ap || doc.require_active_public) {
    if (!ap) errors.push("active_public missing")
    else {
      if (ap.release_sha && ap.release_sha !== wantSha) {
        errors.push("ACTIVE_PUBLIC.release_sha mismatch")
      }
      checkDigest(
        "ACTIVE_PUBLIC.backend_image_digest",
        ap.backend_image_digest,
        wantBe
      )
      checkDigest(
        "ACTIVE_PUBLIC.storefront_image_digest",
        ap.storefront_image_digest,
        wantSf
      )
      if (ap.dokploy_image_pins) {
      checkRef(
          errors,
          "ACTIVE_PUBLIC.dokploy_image_pins.WOODRIGHT_BACKEND_IMAGE",
          ap.dokploy_image_pins.WOODRIGHT_BACKEND_IMAGE,
          wantBe,
          forbidden
        )
        checkRef(
          errors,
          "ACTIVE_PUBLIC.dokploy_image_pins.WOODRIGHT_STOREFRONT_IMAGE",
          ap.dokploy_image_pins.WOODRIGHT_STOREFRONT_IMAGE,
          wantSf,
          forbidden
        )
      }
    }
  }

  const pins = doc.dokploy_pins || null
  if (pins || doc.require_dokploy_pins) {
    if (!pins) errors.push("dokploy_pins missing")
    else {
      checkRef(errors, "DOKPLOY_IMAGE_PINS.WOODRIGHT_BACKEND_IMAGE", pins.WOODRIGHT_BACKEND_IMAGE, wantBe, forbidden)
      checkRef(
        errors,
        "DOKPLOY_IMAGE_PINS.WOODRIGHT_STOREFRONT_IMAGE",
        pins.WOODRIGHT_STOREFRONT_IMAGE,
        wantSf,
        forbidden
      )
      if (Object.prototype.hasOwnProperty.call(pins, "STOREFRONT_IMAGE")) {
        checkRef(errors, "DOKPLOY_IMAGE_PINS.STOREFRONT_IMAGE", pins.STOREFRONT_IMAGE, wantSf, forbidden)
      }
    }
  }

  const manifest = doc.manifest || null
  if (manifest) {
    if (manifest.release_sha && manifest.release_sha !== wantSha) {
      errors.push("manifest.release_sha mismatch")
    }
    checkDigest("manifest.backend_digest", manifest.backend_digest, wantBe)
    checkDigest("manifest.storefront_digest", manifest.storefront_digest, wantSf)
  }

  if (doc.alias_ok === false) errors.push("backend alias missing")
  if (doc.require_alias && doc.alias_ok !== true) {
    errors.push("backend alias not confirmed")
  }

  if (doc.candidate_in_public_config === true) {
    errors.push("candidate ref in public config")
  }

  // Cross-source: env vs compose vs running
  if (env.WOODRIGHT_BACKEND_IMAGE && compose.backend) {
    if (digestFromRef(env.WOODRIGHT_BACKEND_IMAGE) !== digestFromRef(compose.backend)) {
      errors.push("env vs compose backend mismatch")
    }
  }
  if (running.backend_digest && compose.backend) {
    if (running.backend_digest !== digestFromRef(compose.backend)) {
      errors.push("compose-resolved backend differs from running")
    }
  }
  if (running.storefront_digest && compose.storefront) {
    if (running.storefront_digest !== digestFromRef(compose.storefront)) {
      errors.push("compose-resolved storefront differs from running")
    }
  }

  return { ok: errors.length === 0, errors }
}

function runFixtureDir(dir) {
  const files = fs
    .readdirSync(dir)
    .filter((f) => f.endsWith(".json"))
    .sort()
  if (!files.length) fail("no fixtures", { dir })
  let failed = 0
  for (const f of files) {
    const doc = readJson(path.join(dir, f))
    const result = evaluate(doc)
    const expectPass = doc.expect !== "fail"
    const passed = result.ok === expectPass
    if (!passed) {
      failed += 1
      console.error(
        JSON.stringify(
          {
            fixture: f,
            expect: expectPass ? "pass" : "fail",
            got: result.ok ? "pass" : "fail",
            errors: result.errors,
          },
          null,
          2
        )
      )
    } else if (!expectPass && doc.fail_reason) {
      const hay = (result.errors || []).join(" | ").toLowerCase()
      const needle = String(doc.fail_reason).toLowerCase()
      const matched =
        hay.includes(needle) ||
        needle.split(/\s+/).filter((t) => t.length > 3).some((t) => hay.includes(t))
      if (!matched) {
        failed += 1
        console.error(
          JSON.stringify(
            {
              fixture: f,
              expect_fail_reason: doc.fail_reason,
              errors: result.errors,
              message: "failed for unexpected reason",
            },
            null,
            2
          )
        )
      } else {
        console.log(`fixture ${f}: ok`)
      }
    } else {
      console.log(`fixture ${f}: ok`)
    }
  }
  if (failed) fail(`fixture failures: ${failed}/${files.length}`)
  ok({ mode: "fixture-dir", files: files.length })
}

function selfTest() {
  const base = {
    expected: {
      release_sha: "a".repeat(40),
      backend_digest: "sha256:" + "1".repeat(64),
      storefront_digest: "sha256:" + "2".repeat(64),
    },
    env: {
      WOODRIGHT_BACKEND_IMAGE:
        "ghcr.io/x/be@sha256:" + "1".repeat(64),
      WOODRIGHT_STOREFRONT_IMAGE:
        "ghcr.io/x/sf@sha256:" + "2".repeat(64),
    },
    compose_resolved: {
      backend: "ghcr.io/x/be@sha256:" + "1".repeat(64),
      storefront: "ghcr.io/x/sf@sha256:" + "2".repeat(64),
    },
    running: {
      backend_digest: "sha256:" + "1".repeat(64),
      storefront_digest: "sha256:" + "2".repeat(64),
      backend_release_sha: "a".repeat(40),
      storefront_release_sha: "a".repeat(40),
      backend_role: "public_demo",
      storefront_role: "public_demo",
    },
    active_public: {
      release_sha: "a".repeat(40),
      backend_image_digest: "sha256:" + "1".repeat(64),
      storefront_image_digest: "sha256:" + "2".repeat(64),
    },
    dokploy_pins: {
      WOODRIGHT_BACKEND_IMAGE: "ghcr.io/x/be@sha256:" + "1".repeat(64),
      WOODRIGHT_STOREFRONT_IMAGE: "ghcr.io/x/sf@sha256:" + "2".repeat(64),
    },
    alias_ok: true,
  }
  const pass = evaluate(base)
  if (!pass.ok) fail("self-test pass failed", { errors: pass.errors })

  const stale = evaluate({
    ...base,
    env: {
      ...base.env,
      WOODRIGHT_BACKEND_IMAGE: "ghcr.io/x/be@sha256:" + "9".repeat(64),
    },
  })
  if (stale.ok) fail("self-test stale should fail")
  ok({ mode: "self-test" })
}

function dockerInspect(name) {
  const r = spawnSync("docker", ["inspect", name], { encoding: "utf8" })
  if (r.status !== 0) return null
  return JSON.parse(r.stdout)[0]
}

function imageDigestFromInspect(ins) {
  const cfg = (ins && ins.Config && ins.Config.Image) || ""
  const fromCfg = digestFromRef(cfg)
  if (fromCfg) return fromCfg
  // RepoDigests
  const digests = (ins.RepoDigests || [])
  for (const d of digests) {
    const x = digestFromRef(d)
    if (x) return x
  }
  return null
}

function labelOrEnv(ins, labelKey, envKey) {
  const labels = (ins.Config && ins.Config.Labels) || {}
  if (labels[labelKey]) return labels[labelKey]
  const env = (ins.Config && ins.Config.Env) || []
  const prefix = `${envKey}=`
  for (const e of env) {
    if (e.startsWith(prefix)) return e.slice(prefix.length)
  }
  return undefined
}

function liveInventory() {
  const expected = {
    release_sha: arg("--expected-release-sha", process.env.WOODRIGHT_EXPECTED_RELEASE_SHA || ""),
    backend_digest: arg("--expected-backend-digest", process.env.WOODRIGHT_EXPECTED_BACKEND_DIGEST || ""),
    storefront_digest: arg(
      "--expected-storefront-digest",
      process.env.WOODRIGHT_EXPECTED_STOREFRONT_DIGEST || ""
    ),
  }
  if (!expected.release_sha || !expected.backend_digest || !expected.storefront_digest) {
    return {
      ok: false,
      errors: [
        "live mode requires --expected-release-sha, --expected-backend-digest, --expected-storefront-digest",
      ],
    }
  }

  const composeFile = arg(
    "--compose-file",
    "/etc/dokploy/compose/woodright-stack-3dsdhd/code/docker-compose.staging.yml"
  )
  const envFile = arg(
    "--env-file",
    "/etc/dokploy/compose/woodright-stack-3dsdhd/code/.env"
  )
  const activePublicPath = arg(
    "--active-public",
    "/srv/woodright/runtime-identity/ACTIVE_PUBLIC.json"
  )
  const pinsPath = arg(
    "--dokploy-pins",
    "/srv/woodright/runtime-identity/DOKPLOY_IMAGE_PINS.env"
  )

  const aliasCheck = assertComposeDeclaresBackendAlias(composeFile)
  const envText = fs.readFileSync(envFile, "utf8")
  const env = parseEnvText(envText)

  const composeDir = path.dirname(composeFile)
  const cfg = spawnSync(
    "docker",
    ["compose", "--env-file", envFile, "-f", composeFile, "config", "--images"],
    { encoding: "utf8", cwd: composeDir }
  )
  if (cfg.status !== 0) {
    return {
      ok: false,
      errors: [`docker compose config failed: ${(cfg.stderr || "").trim() || "non-zero"}`],
    }
  }
  const images = cfg.stdout.split(/\r?\n/).map((s) => s.trim()).filter(Boolean)
  const compose_resolved = {
    backend: images.find((i) => /woodright-backend/.test(i)) || null,
    storefront: images.find((i) => /woodright-storefront/.test(i)) || null,
  }

  const be = dockerInspect(DEFAULT_BE)
  const sf = dockerInspect(DEFAULT_SF)
  if (!be || !sf) {
    return { ok: false, errors: ["docker inspect failed for public containers"] }
  }

  const running = {
    backend_digest: imageDigestFromInspect(be),
    storefront_digest: imageDigestFromInspect(sf),
    backend_release_sha: labelOrEnv(be, "com.woodright.release-sha", "WOODRIGHT_RELEASE_SHA"),
    storefront_release_sha: labelOrEnv(sf, "com.woodright.release-sha", "WOODRIGHT_RELEASE_SHA"),
    backend_role: labelOrEnv(be, "com.woodright.runtime-role", "WOODRIGHT_RUNTIME_ROLE"),
    storefront_role: labelOrEnv(sf, "com.woodright.runtime-role", "WOODRIGHT_RUNTIME_ROLE"),
    backend_exposure: labelOrEnv(be, "com.woodright.exposure", "WOODRIGHT_EXPOSURE"),
    storefront_exposure: labelOrEnv(sf, "com.woodright.exposure", "WOODRIGHT_EXPOSURE"),
    backend_running: !!(be.State && be.State.Running === true),
    storefront_running: !!(sf.State && sf.State.Running === true),
  }

  let active_public = null
  if (fs.existsSync(activePublicPath)) {
    active_public = readJson(activePublicPath)
  }
  let dokploy_pins = null
  if (fs.existsSync(pinsPath)) {
    dokploy_pins = parseEnvText(fs.readFileSync(pinsPath, "utf8"))
  }

  const shared = Object.keys(be.NetworkSettings.Networks || {}).find((n) =>
    n.endsWith("_woodright_staging") || n === "woodright_staging"
  )
  let alias_ok = false
  if (shared) {
    const net = be.NetworkSettings.Networks[shared]
    const als = (net.Aliases || []).concat(net.DNSNames || [])
    alias_ok = als.includes("backend")
  }

  const doc = {
    expected,
    env: {
      WOODRIGHT_BACKEND_IMAGE: env.WOODRIGHT_BACKEND_IMAGE,
      WOODRIGHT_STOREFRONT_IMAGE: env.WOODRIGHT_STOREFRONT_IMAGE,
      STOREFRONT_IMAGE: env.STOREFRONT_IMAGE,
    },
    compose_resolved,
    running,
    active_public: active_public
      ? {
          release_sha: active_public.release_sha,
          backend_image_digest: active_public.backend_image_digest,
          storefront_image_digest: active_public.storefront_image_digest,
          dokploy_image_pins: active_public.dokploy_image_pins,
        }
      : null,
    dokploy_pins,
    alias_ok,
    require_running: true,
    require_running_sha: true,
    require_active_public: true,
    require_dokploy_pins: true,
    require_compose: true,
    require_alias: true,
    forbidden_digests: [
      "sha256:5243c7c8f1146c2832af7093f1a98f4f8c4f8e5039f733d406d9571c9c657fe8",
      "sha256:034db9486b9be45e282f543f7f26cbeb862a38b1282218bd0528831a44cf0828",
    ],
  }

  if (!aliasCheck.ok) {
    return { ok: false, errors: [aliasCheck.reason] }
  }
  return evaluate(doc)
}

function main() {
  if (hasFlag("--self-test")) {
    selfTest()
    return
  }

  const composeFile = arg(
    "--compose-file",
    path.join(process.cwd(), "docker-compose.staging.yml")
  )
  if (fs.existsSync(composeFile)) {
    const aliasCheck = assertComposeDeclaresBackendAlias(composeFile)
    if (!aliasCheck.ok && !hasFlag("--fixture-dir") && !hasFlag("--inspect-json")) {
      // only hard-fail when not in fixture mode
      if (hasFlag("--live") || hasFlag("--require-compose-alias")) {
        fail(aliasCheck.reason, { composeFile })
      }
    }
  }

  const fixtureDir = arg("--fixture-dir", "")
  if (fixtureDir) {
    runFixtureDir(fixtureDir)
    return
  }

  const inspectJson = arg("--inspect-json", "")
  if (inspectJson) {
    const doc = readJson(inspectJson)
    const result = evaluate(doc)
    const expectPass = doc.expect !== "fail"
    if (result.ok !== expectPass) {
      fail("inspect-json mismatch", { errors: result.errors })
    }
    ok({ mode: "inspect-json", errors: result.errors })
    return
  }

  if (hasFlag("--live")) {
    const result = liveInventory()
    if (!result.ok) fail("live pin consistency failed", { errors: result.errors })
    ok({ mode: "live", errors: result.errors })
    return
  }

  // Default: compose contract only
  if (!fs.existsSync(composeFile)) fail("compose file missing", { composeFile })
  const aliasCheck = assertComposeDeclaresBackendAlias(composeFile)
  if (!aliasCheck.ok) fail(aliasCheck.reason, { composeFile })
  ok({
    mode: "compose-only",
    composeFile,
    message: "compose interpolates WOODRIGHT_*_IMAGE and declares backend alias",
  })
}

main()
