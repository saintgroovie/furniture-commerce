#!/usr/bin/env node
/**
 * Fail-closed verifier: public storefront can resolve hostname `backend`
 * to the public demo backend on the canonical shared Docker network.
 *
 * Modes:
 *   --self-test
 *   --fixture-dir <dir>     (JSON fixtures; no live Docker)
 *   --inspect-json <file>   (offline docker inspect dump)
 *   --compose-file <path>   (default: docker-compose.staging.yml)
 *   --live                  (requires docker CLI; public host only)
 *
 * Exit non-zero on any mismatch. Never prints secrets.
 */
"use strict"

const fs = require("node:fs")
const path = require("node:path")
const { spawnSync } = require("node:child_process")

const DEFAULT_SHARED_NETWORK = "woodright_staging"
const DEFAULT_ALIAS = "backend"
const DEFAULT_BACKEND_CONTAINER = "woodright-staging-backend"
const DEFAULT_STOREFRONT_CONTAINER = "woodright-staging-storefront"
const PUBLIC_ROLE = "public_demo"
const PUBLIC_EXPOSURE = "public"

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

/** Parse compose YAML enough to require backend.aliases on shared network. */
function assertComposeDeclaresBackendAlias(composePath, sharedNet, alias) {
  const text = fs.readFileSync(composePath, "utf8")
  // Long-form network attachment with aliases under backend service.
  const backendIdx = text.search(/^  backend:\s*$/m)
  if (backendIdx < 0) {
    return { ok: false, reason: "compose missing backend service" }
  }
  const nextSvc = text.slice(backendIdx + 1).search(/^  [a-zA-Z0-9_-]+:\s*$/m)
  const backendBlock =
    nextSvc < 0
      ? text.slice(backendIdx)
      : text.slice(backendIdx, backendIdx + 1 + nextSvc)

  if (!backendBlock.includes(`${sharedNet}:`)) {
    return {
      ok: false,
      reason: `backend not attached to ${sharedNet} via long-form networks`,
    }
  }
  const aliasRe = new RegExp(
    `${sharedNet}:\\s*\\n(?:\\s+[^\\n]+\\n)*?\\s+aliases:\\s*\\n\\s+-\\s+${alias}\\b`
  )
  if (!aliasRe.test(backendBlock)) {
    return {
      ok: false,
      reason: `backend.${sharedNet}.aliases missing '${alias}'`,
    }
  }
  if (!/MEDUSA_BACKEND_URL_INTERNAL:-\s*http:\/\/backend:9000/.test(text)) {
    return {
      ok: false,
      reason: "storefront default MEDUSA_BACKEND_* must target http://backend:9000",
    }
  }
  return { ok: true }
}

/**
 * Evaluate a fixture / inspect snapshot.
 * Expected shape:
 * {
 *   shared_network: "woodright_staging" | "woodright-stack-..._woodright_staging",
 *   alias: "backend",
 *   expected_backend_container: "woodright-staging-backend",
 *   expected_storefront_container: "woodright-staging-storefront",
 *   expected_release_sha?: "abc...",
 *   containers: [
 *     {
 *       name, running, role, exposure, release_sha,
 *       networks: { [netName]: { aliases: string[], ipv4?: string } }
 *     }
 *   ],
 *   dns_from_storefront?: { backend: "ip"|null },
 *   expect: "pass"|"fail",
 *   fail_reason?: string
 * }
 */
function evaluateInventory(doc) {
  const errors = []
  const shared = doc.shared_network || DEFAULT_SHARED_NETWORK
  const alias = doc.alias || DEFAULT_ALIAS
  const expectBe = doc.expected_backend_container || DEFAULT_BACKEND_CONTAINER
  const expectSf = doc.expected_storefront_container || DEFAULT_STOREFRONT_CONTAINER
  const containers = Array.isArray(doc.containers) ? doc.containers : []

  const byName = new Map(containers.map((c) => [c.name, c]))
  const be = byName.get(expectBe)
  const sf = byName.get(expectSf)
  if (!be) errors.push(`missing backend container ${expectBe}`)
  if (!sf) errors.push(`missing storefront container ${expectSf}`)
  if (!be || !sf) return { ok: false, errors }

  if (be.running !== true) errors.push("backend not running")
  if (sf.running !== true) errors.push("storefront not running")

  if (be.role && be.role !== PUBLIC_ROLE) {
    errors.push(`backend role ${be.role} != ${PUBLIC_ROLE}`)
  }
  if (sf.role && sf.role !== PUBLIC_ROLE) {
    errors.push(`storefront role ${sf.role} != ${PUBLIC_ROLE}`)
  }
  if (be.exposure && be.exposure !== PUBLIC_EXPOSURE) {
    errors.push(`backend exposure ${be.exposure} != ${PUBLIC_EXPOSURE}`)
  }
  if (sf.exposure && sf.exposure !== PUBLIC_EXPOSURE) {
    errors.push(`storefront exposure ${sf.exposure} != ${PUBLIC_EXPOSURE}`)
  }

  if (doc.expected_release_sha) {
    const want = doc.expected_release_sha
    if (!be.release_sha) {
      errors.push("backend release_sha missing")
    } else if (be.release_sha !== want) {
      errors.push("backend release_sha mismatch")
    }
    if (!sf.release_sha) {
      errors.push("storefront release_sha missing")
    } else if (sf.release_sha !== want) {
      errors.push("storefront release_sha mismatch")
    }
  }

  const beNet = (be.networks || {})[shared]
  const sfNet = (sf.networks || {})[shared]
  if (!beNet) errors.push(`backend not on shared network ${shared}`)
  if (!sfNet) errors.push(`storefront not on shared network ${shared}`)

  const beAliases = (beNet && beNet.aliases) || []
  if (!beAliases.includes(alias)) {
    errors.push(`backend missing alias '${alias}' on ${shared}`)
  }

  // Collision: only RUNNING containers may hold the public alias.
  const holders = containers.filter((c) => {
    if (c.running !== true) return false
    const n = (c.networks || {})[shared]
    return n && Array.isArray(n.aliases) && n.aliases.includes(alias)
  })
  if (holders.length > 1) {
    errors.push(
      `alias collision on ${shared}: ${holders.map((h) => h.name).join(", ")}`
    )
  }
  if (holders.length === 1 && holders[0].name !== expectBe) {
    errors.push(
      `alias '${alias}' owned by ${holders[0].name}, expected ${expectBe}`
    )
  }

  // Candidate must not hold public alias while running on shared net.
  for (const c of containers) {
    if (c.running !== true) continue
    if (c.role === "non_public_candidate" || c.exposure === "private") {
      const n = (c.networks || {})[shared]
      if (n && Array.isArray(n.aliases) && n.aliases.includes(alias)) {
        errors.push(`candidate/private ${c.name} holds public alias '${alias}'`)
      }
    }
  }

  if (doc.dns_from_storefront && Object.prototype.hasOwnProperty.call(doc.dns_from_storefront, alias)) {
    const resolved = doc.dns_from_storefront[alias]
    if (!resolved) errors.push(`storefront DNS for '${alias}' empty`)
    else if (beNet) {
      // Multi-homed backends may resolve to any attached IP (shared or dokploy).
      const beIps = new Set()
      if (beNet.ipv4) beIps.add(String(beNet.ipv4).split("/")[0])
      for (const n of Object.values(be.networks || {})) {
        if (n && n.ipv4) beIps.add(String(n.ipv4).split("/")[0])
      }
      if (beIps.size > 0 && !beIps.has(resolved)) {
        errors.push(
          `DNS '${alias}'=${resolved} does not match backend ipv4s [${[...beIps].join(", ")}]`
        )
      }
    }
  }

  return { ok: errors.length === 0, errors, holders: holders.map((h) => h.name) }
}

function runFixtureDir(dir) {
  const files = fs
    .readdirSync(dir)
    .filter((f) => f.endsWith(".json"))
    .sort()
  if (files.length === 0) fail("no fixtures", { dir })
  let failed = 0
  for (const f of files) {
    const doc = readJson(path.join(dir, f))
    const result = evaluateInventory(doc)
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
      const tokens = needle.split(/\s+/).filter((t) => t.length > 3)
      const matched =
        hay.includes(needle) ||
        tokens.some((t) => hay.includes(t)) ||
        (needle.includes("collision") && /collision|candidate|holds public alias/.test(hay)) ||
        (needle.includes("missing alias") && /missing alias/.test(hay)) ||
        (needle.includes("sha") && /release_sha (mismatch|missing)/.test(hay)) ||
        (needle.includes("missing") && /release_sha missing|missing alias/.test(hay)) ||
        (needle.includes("wrong") && /owned by|expected/.test(hay)) ||
        (needle.includes("dns") && /dns/.test(hay))
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

function dockerInspect(name) {
  const r = spawnSync("docker", ["inspect", name], { encoding: "utf8" })
  if (r.status !== 0) return null
  return JSON.parse(r.stdout)[0]
}

function labelOrEnv(inspect, labelKey, envKey) {
  const labels = (inspect.Config && inspect.Config.Labels) || {}
  if (labels[labelKey]) return labels[labelKey]
  const env = (inspect.Config && inspect.Config.Env) || []
  const prefix = `${envKey}=`
  for (const e of env) {
    if (e.startsWith(prefix)) return e.slice(prefix.length)
  }
  return undefined
}

function resolveExpectedReleaseSha() {
  const fromArg = arg("--expected-release-sha", "")
  if (fromArg) return fromArg
  if (process.env.WOODRIGHT_EXPECTED_RELEASE_SHA) {
    return process.env.WOODRIGHT_EXPECTED_RELEASE_SHA
  }
  const activePath = arg(
    "--active-public",
    path.join(process.cwd(), "ACTIVE_PUBLIC.json")
  )
  if (fs.existsSync(activePath)) {
    try {
      const active = readJson(activePath)
      return (
        active.release_sha ||
        active.app_release_sha ||
        active.sha ||
        active.git_sha ||
        undefined
      )
    } catch {
      return undefined
    }
  }
  return undefined
}

function inventoryFromLive({ sharedNetworkProjectPrefix, expectedReleaseSha }) {
  const beName = DEFAULT_BACKEND_CONTAINER
  const sfName = DEFAULT_STOREFRONT_CONTAINER
  const be = dockerInspect(beName)
  const sf = dockerInspect(sfName)
  if (!be || !sf) {
    return {
      ok: false,
      errors: [`docker inspect failed for ${!be ? beName : sfName}`],
    }
  }

  // Prefer project-prefixed network name if present.
  const beNets = be.NetworkSettings.Networks || {}
  const sharedCandidates = Object.keys(beNets).filter(
    (n) => n === DEFAULT_SHARED_NETWORK || n.endsWith(`_${DEFAULT_SHARED_NETWORK}`)
  )
  const shared =
    sharedCandidates.find((n) => n.includes(sharedNetworkProjectPrefix || "woodright")) ||
    sharedCandidates[0] ||
    DEFAULT_SHARED_NETWORK

  function pack(inspect) {
    const nets = {}
    for (const [net, cfg] of Object.entries(inspect.NetworkSettings.Networks || {})) {
      nets[net] = {
        aliases: cfg.Aliases || [],
        ipv4: cfg.IPAddress || null,
        dns_names: cfg.DNSNames || [],
      }
    }
    return {
      name: String(inspect.Name || "").replace(/^\//, ""),
      running: inspect.State && inspect.State.Running === true,
      role: labelOrEnv(inspect, "com.woodright.runtime-role", "WOODRIGHT_RUNTIME_ROLE"),
      exposure: labelOrEnv(inspect, "com.woodright.exposure", "WOODRIGHT_EXPOSURE"),
      release_sha: labelOrEnv(
        inspect,
        "com.woodright.release-sha",
        "WOODRIGHT_RELEASE_SHA"
      ),
      networks: nets,
    }
  }

  // Fail-closed: collision scan must succeed.
  const ps = spawnSync(
    "docker",
    ["ps", "-q", "--filter", `network=${shared}`],
    { encoding: "utf8" }
  )
  if (ps.status !== 0) {
    return {
      ok: false,
      errors: [
        `docker ps network enumeration failed for ${shared}: ${(ps.stderr || "").trim() || "non-zero"}`,
      ],
    }
  }
  const others = []
  for (const id of ps.stdout.split(/\s+/).filter(Boolean)) {
    const ins = dockerInspect(id)
    if (!ins) {
      return {
        ok: false,
        errors: [`docker inspect failed for network peer ${id}`],
      }
    }
    const name = String(ins.Name || "").replace(/^\//, "")
    if (name === beName || name === sfName) continue
    others.push(pack(ins))
  }

  const doc = {
    shared_network: shared,
    alias: DEFAULT_ALIAS,
    expected_backend_container: beName,
    expected_storefront_container: sfName,
    containers: [pack(be), pack(sf), ...others],
  }
  if (expectedReleaseSha) {
    doc.expected_release_sha = expectedReleaseSha
  } else {
    return {
      ok: false,
      errors: [
        "live mode requires --expected-release-sha, WOODRIGHT_EXPECTED_RELEASE_SHA, or ACTIVE_PUBLIC.json",
      ],
    }
  }

  // Live DNS from storefront
  const dns = spawnSync(
    "docker",
    ["exec", sfName, "getent", "hosts", DEFAULT_ALIAS],
    { encoding: "utf8" }
  )
  const dnsIp =
    dns.status === 0 && dns.stdout.trim()
      ? dns.stdout.trim().split(/\s+/)[0]
      : null
  doc.dns_from_storefront = { [DEFAULT_ALIAS]: dnsIp }

  return evaluateInventory(doc)
}

function selfTest() {
  const pass = evaluateInventory({
    shared_network: "woodright_staging",
    expected_release_sha: "a".repeat(40),
    containers: [
      {
        name: "woodright-staging-backend",
        running: true,
        role: "public_demo",
        exposure: "public",
        release_sha: "a".repeat(40),
        networks: {
          woodright_staging: { aliases: ["backend"], ipv4: "172.19.0.4" },
        },
      },
      {
        name: "woodright-staging-storefront",
        running: true,
        role: "public_demo",
        exposure: "public",
        release_sha: "a".repeat(40),
        networks: {
          woodright_staging: { aliases: ["storefront"], ipv4: "172.19.0.7" },
        },
      },
    ],
    dns_from_storefront: { backend: "172.19.0.4" },
  })
  if (!pass.ok) fail("self-test pass case failed", { errors: pass.errors })

  const collision = evaluateInventory({
    shared_network: "woodright_staging",
    containers: [
      {
        name: "woodright-staging-backend",
        running: true,
        role: "public_demo",
        exposure: "public",
        networks: { woodright_staging: { aliases: ["backend"] } },
      },
      {
        name: "woodright-staging-storefront",
        running: true,
        role: "public_demo",
        exposure: "public",
        networks: { woodright_staging: { aliases: ["storefront"] } },
      },
      {
        name: "evil-candidate",
        running: true,
        role: "non_public_candidate",
        exposure: "private",
        networks: { woodright_staging: { aliases: ["backend"] } },
      },
    ],
  })
  if (collision.ok) fail("self-test collision should fail")
  ok({ mode: "self-test" })
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
  const composeCheck = assertComposeDeclaresBackendAlias(
    composeFile,
    DEFAULT_SHARED_NETWORK,
    DEFAULT_ALIAS
  )
  if (!composeCheck.ok) fail(composeCheck.reason, { composeFile })

  const fixtureDir = arg("--fixture-dir", "")
  if (fixtureDir) {
    runFixtureDir(fixtureDir)
    return
  }

  const inspectJson = arg("--inspect-json", "")
  if (inspectJson) {
    const doc = readJson(inspectJson)
    const result = evaluateInventory(doc)
    const expectPass = doc.expect !== "fail"
    if (result.ok !== expectPass) {
      fail("inspect-json evaluation mismatch", {
        expect: expectPass ? "pass" : "fail",
        errors: result.errors,
      })
    }
    ok({ mode: "inspect-json", errors: result.errors })
    return
  }

  if (hasFlag("--live")) {
    const expectedReleaseSha = resolveExpectedReleaseSha()
    const result = inventoryFromLive({
      sharedNetworkProjectPrefix: arg("--network-prefix", "woodright"),
      expectedReleaseSha,
    })
    if (!result.ok) fail("live alias verification failed", { errors: result.errors })
    ok({
      mode: "live",
      holders: result.holders,
      expected_release_sha: expectedReleaseSha,
    })
    return
  }

  // Default: compose contract only (CI-safe).
  ok({
    mode: "compose-only",
    composeFile,
    message: "compose declares backend alias; use --live on VM for DNS proof",
  })
}

main()
