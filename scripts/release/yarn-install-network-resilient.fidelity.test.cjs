#!/usr/bin/env node
/**
 * Deterministic fidelity for yarn-install-network-resilient.cjs.
 * Classification + controlled simulations (no live registry calls).
 *
 *   node scripts/release/yarn-install-network-resilient.fidelity.test.cjs
 */
"use strict"

const fs = require("node:fs")
const os = require("node:os")
const path = require("node:path")
const { spawnSync } = require("node:child_process")

const mod = require("./yarn-install-network-resilient.cjs")
const helper = path.join(__dirname, "yarn-install-network-resilient.cjs")

let failed = 0
function check(cond, msg) {
  if (cond) console.log("PASS", msg)
  else {
    console.error("FAIL", msg)
    failed++
  }
}

/** Yarn Berry colors status digits; mirrors incident run 31044540376. */
const ANSI_YN0035_429 =
  "➤ YN0035: │ @medusajs/modules-sdk@npm:2.18.0: The remote server failed to provide the requested resource\n" +
  "➤ YN0035: │   \u001b[38;5;111mResponse Code\u001b[39m: \u001b[38;5;220m429\u001b[39m (Too Many Requests)\n" +
  "➤ YN0035: │   \u001b[38;5;111mRequest Method\u001b[39m: GET\n" +
  "➤ YN0035: │   \u001b[38;5;111mRequest URL\u001b[39m: \u001b[38;5;170mhttps://registry.npmjs.org/@medusajs%2fmodules-sdk\u001b[39m\n" +
  "➤ YN0000: · Failed with errors in 10m 5s\n"

const cases = [
  {
    name: "ANSI YN0035 Response Code 429 retry",
    text: ANSI_YN0035_429,
    retryable: true,
    reasonIncludes: "429",
  },
  {
    name: "HTTP 429 retry",
    text: "YN0035\n  Response Code: 429 (Too Many Requests)\n  Request Retry Count: 3",
    retryable: true,
    reasonIncludes: "429",
  },
  {
    name: "ANSI 429 Too Many Requests phrase retry",
    text: "fetch failed: \u001b[31m429 Too Many Requests\u001b[0m from registry.npmjs.org",
    retryable: true,
    reasonIncludes: "429",
  },
  {
    name: "HTTP 503 retry",
    text: "Response Code: 503 (Service Unavailable)",
    retryable: true,
    reasonIncludes: "503",
  },
  {
    name: "ECONNRESET retry",
    text: "Error: read ECONNRESET while fetching package",
    retryable: true,
    reasonIncludes: "ECONNRESET",
  },
  {
    name: "immutable lockfile no retry",
    text: "YN0028: The lockfile would have been modified by this install, which is explicitly forbidden.",
    retryable: false,
    reasonIncludes: "immutable",
  },
  {
    name: "checksum no retry",
    text: "YN0018: The remote archive doesn't match the expected checksum",
    retryable: false,
    reasonIncludes: "integrity",
  },
  {
    name: "401 no retry",
    text: "Response Code: 401 (Unauthorized)",
    retryable: false,
    reasonIncludes: "auth",
  },
  {
    name: "403 no retry",
    text: "Response Code: 403 (Forbidden)",
    retryable: false,
    reasonIncludes: "auth",
  },
  {
    name: "404 package not found no retry",
    text: "YN0035\n  Response Code: 404 (Not Found)",
    retryable: false,
    reasonIncludes: "package_not_found",
  },
  {
    name: "ANSI YN0035 + HTTP 404 no retry",
    text:
      "YN0035\n  \u001b[38;5;111mResponse Code\u001b[39m: \u001b[38;5;220m404\u001b[39m (Not Found)",
    retryable: false,
    reasonIncludes: "package_not_found",
  },
  {
    name: "YN0035 without HTTP evidence no retry",
    text: "YN0035: The remote server failed to provide the requested resource",
    retryable: false,
    reasonIncludes: "YN0035_without",
  },
  {
    name: "unknown failure no retry",
    text: "something completely unexpected blew up",
    retryable: false,
    reasonIncludes: "unknown",
  },
  {
    name: "test failure text no retry",
    text: "AssertionError [ERR_ASSERTION]: expected true",
    retryable: false,
    reasonIncludes: "unknown",
  },
]

for (const c of cases) {
  const r = mod.classifyInstallFailure(c.text)
  check(r.retryable === c.retryable, `${c.name}: retryable=${r.retryable}`)
  check(
    String(r.reason).includes(c.reasonIncludes),
    `${c.name}: reason=${r.reason}`
  )
}

// ANSI stripper preserves package / Yarn code / HTTP status
{
  const stripped = mod.stripAnsi(ANSI_YN0035_429)
  check(!/\u001b\[/.test(stripped), "stripAnsi removes CSI escapes")
  check(/@medusajs\/modules-sdk/.test(stripped), "stripAnsi keeps package name")
  check(/YN0035/.test(stripped), "stripAnsi keeps Yarn code")
  check(/Response Code:\s*429/.test(stripped), "stripAnsi keeps Response Code 429")
  check(mod.extractHttpStatuses(ANSI_YN0035_429).includes(429), "extractHttpStatuses sees ANSI 429")
}

check(mod.parseRetryAfterSeconds("Retry-After: 120", 300) === 120, "Retry-After 120")
check(mod.parseRetryAfterSeconds("Retry-After: 9999", 300) === 300, "Retry-After clamped")
check(
  mod.parseRetryAfterSeconds("Retry-After: Wed, 21 Oct 2015 07:28:00 GMT", 300) === null,
  "HTTP-date Retry-After rejected"
)
check(mod.parseRetryAfterSeconds("Retry-After: abc; rm -rf /", 300) === null, "malformed rejected")
check(
  mod.computeBackoffSeconds({
    attemptIndex: 1,
    combinedOutput: "Response Code: 429",
    maxSleepSec: 300,
    baseSleepSec: 30,
    remainingCumulativeSec: 600,
  }) === 30,
  "backoff attempt1=30"
)
check(
  mod.computeBackoffSeconds({
    attemptIndex: 2,
    combinedOutput: "Response Code: 429",
    maxSleepSec: 300,
    baseSleepSec: 30,
    remainingCumulativeSec: 600,
  }) === 60,
  "backoff attempt2=60"
)
check(
  mod.computeBackoffSeconds({
    attemptIndex: 1,
    combinedOutput: "Retry-After: 45\nResponse Code: 429",
    maxSleepSec: 300,
    baseSleepSec: 30,
    remainingCumulativeSec: 600,
  }) === 45,
  "Retry-After preferred"
)
check(mod.redact("ghp_abcdefghijklmnop").includes("[REDACTED]"), "secrets redacted")

const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), "wr-install-resil-"))

function writeMock(name, body) {
  const p = path.join(tmpRoot, name)
  fs.writeFileSync(p, body)
  return p
}

function runHelper(env, cwd = tmpRoot) {
  return spawnSync(process.execPath, [helper, "--cwd", cwd], {
    encoding: "utf8",
    env: {
      ...process.env,
      WOODRIGHT_INSTALL_ALLOW_TEST_COMMAND: "1",
      WOODRIGHT_INSTALL_SLEEP_MS_OVERRIDE: "0",
      WOODRIGHT_INSTALL_MAX_ATTEMPTS: "3",
      ...env,
    },
  })
}

function countAttempts(out) {
  const m = out.match(/"event":"attempt_start"/g)
  return m ? m.length : 0
}

// Scenario 1: 429 then success
{
  const state = path.join(tmpRoot, "s1.state")
  fs.writeFileSync(state, "0")
  const mock = writeMock(
    "s1.cjs",
    `const fs=require("fs");const s=${JSON.stringify(state)};
let n=Number(fs.readFileSync(s,"utf8"));n++;fs.writeFileSync(s,String(n));
if(n===1){console.error("Response Code: 429 (Too Many Requests)");process.exit(1)}
process.exit(0);`
  )
  const r = runHelper({
    WOODRIGHT_INSTALL_COMMAND: `${process.execPath} ${mock}`,
  })
  const combined = `${r.stdout}\n${r.stderr}`
  check(r.status === 0, "sim1 final success")
  check(countAttempts(combined) === 2, `sim1 exactly 2 attempts (got ${countAttempts(combined)})`)
}

// Scenario 1b: ANSI-colored 429 then success (incident regression)
{
  const state = path.join(tmpRoot, "s1b.state")
  fs.writeFileSync(state, "0")
  const ansiLine =
    "YN0035: \\u001b[38;5;111mResponse Code\\u001b[39m: \\u001b[38;5;220m429\\u001b[39m (Too Many Requests)"
  const mock = writeMock(
    "s1b.cjs",
    `const fs=require("fs");const s=${JSON.stringify(state)};
let n=Number(fs.readFileSync(s,"utf8"));n++;fs.writeFileSync(s,String(n));
if(n===1){console.error("${ansiLine}");process.exit(1)}
process.exit(0);`
  )
  const r = runHelper({
    WOODRIGHT_INSTALL_COMMAND: `${process.execPath} ${mock}`,
  })
  const combined = `${r.stdout}\n${r.stderr}`
  check(r.status === 0, "sim1b ANSI 429 then success")
  check(countAttempts(combined) === 2, `sim1b exactly 2 attempts (got ${countAttempts(combined)})`)
  check(!/fail_fast/.test(combined), "sim1b no fail_fast on ANSI 429")
  check(/"reason":"http_429"/.test(combined), "sim1b classified http_429")
}

// Scenario 2: all 429
{
  const mock = writeMock(
    "s2.cjs",
    `console.error("Response Code: 429 (Too Many Requests)");process.exit(42);`
  )
  const r = runHelper({
    WOODRIGHT_INSTALL_COMMAND: `${process.execPath} ${mock}`,
  })
  const combined = `${r.stdout}\n${r.stderr}`
  check(r.status === 42, "sim2 preserves exit 42")
  check(countAttempts(combined) === 3, `sim2 max 3 attempts (got ${countAttempts(combined)})`)
}

// Scenario 2b: all ANSI 429 → exhaustion
{
  const mock = writeMock(
    "s2b.cjs",
    `console.error("YN0035: \\u001b[38;5;111mResponse Code\\u001b[39m: \\u001b[38;5;220m429\\u001b[39m (Too Many Requests)");process.exit(42);`
  )
  const r = runHelper({
    WOODRIGHT_INSTALL_COMMAND: `${process.execPath} ${mock}`,
  })
  const combined = `${r.stdout}\n${r.stderr}`
  check(r.status === 42, "sim2b ANSI preserves exit 42")
  check(countAttempts(combined) === 3, `sim2b max 3 attempts (got ${countAttempts(combined)})`)
  check(/retries_exhausted/.test(combined), "sim2b retries_exhausted")
  check(!/fail_fast/.test(combined), "sim2b no fail_fast")
}

// Scenario 3: immutable
{
  const mock = writeMock(
    "s3.cjs",
    `console.error("YN0028: The lockfile would have been modified");process.exit(7);`
  )
  const r = runHelper({
    WOODRIGHT_INSTALL_COMMAND: `${process.execPath} ${mock}`,
  })
  const combined = `${r.stdout}\n${r.stderr}`
  check(r.status === 7, "sim3 exit 7")
  check(countAttempts(combined) === 1, "sim3 single attempt")
  check(/fail_fast/.test(combined), "sim3 fail_fast")
}

// Scenario 4: checksum
{
  const mock = writeMock(
    "s4.cjs",
    `console.error("YN0018: checksum mismatch integrity");process.exit(8);`
  )
  const r = runHelper({
    WOODRIGHT_INSTALL_COMMAND: `${process.execPath} ${mock}`,
  })
  const combined = `${r.stdout}\n${r.stderr}`
  check(r.status === 8, "sim4 exit 8")
  check(countAttempts(combined) === 1, "sim4 single attempt")
}

// Scenario 5: successful install then "test failure" is outside helper — helper succeeds once
{
  const mock = writeMock("s5.cjs", `process.exit(0);`)
  const r = runHelper({
    WOODRIGHT_INSTALL_COMMAND: `${process.execPath} ${mock}`,
  })
  check(r.status === 0, "sim5 install success (tests not wrapped)")
  check(countAttempts(`${r.stdout}\n${r.stderr}`) === 1, "sim5 one install attempt")
}

// Max attempts env
{
  const mock = writeMock(
    "smax.cjs",
    `console.error("Response Code: 503");process.exit(1);`
  )
  const r = runHelper({
    WOODRIGHT_INSTALL_COMMAND: `${process.execPath} ${mock}`,
    WOODRIGHT_INSTALL_MAX_ATTEMPTS: "2",
  })
  check(countAttempts(`${r.stdout}\n${r.stderr}`) === 2, "max attempts env=2 enforced")
}

try {
  fs.rmSync(tmpRoot, { recursive: true, force: true })
} catch {
  /* ignore */
}

if (failed > 0) {
  console.error(`yarn-install-network-resilient.fidelity: ${failed} failure(s)`)
  process.exit(1)
}
console.log("yarn-install-network-resilient.fidelity: ok")
